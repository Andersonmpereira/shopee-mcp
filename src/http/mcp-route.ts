import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { headerValue, isInitializeRequest } from './access.js';

type ActiveSession = {
  id: string | undefined;
  transport: StreamableHTTPServerTransport;
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * One long-lived MCP server, one HTTP session at a time.
 * A new `initialize` replaces the previous session so a reconnect from Cursor
 * does not stay stuck on "already connected".
 */
export function createMcpHttpHandler(server: McpServer) {
  let active: ActiveSession | undefined;
  let linked = false;
  let opening: Promise<void> = Promise.resolve();

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = opening.then(fn, fn);
    opening = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function replaceSession(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void> {
    await enqueue(async () => {
      if (linked) {
        await server.close().catch(() => undefined);
        linked = false;
        active = undefined;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          active = { id: sessionId, transport };
        },
        onsessionclosed: () => {
          if (active?.transport === transport) active = undefined;
        },
      });
      transport.onclose = () => {
        if (active?.transport !== transport) return;
        active = undefined;
        linked = false;
      };
      await server.connect(transport);
      linked = true;
      await transport.handleRequest(req, res, body);
    });
  }

  return async function handleMcp(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void> {
    try {
      const sessionHeader = headerValue(req.headers['mcp-session-id']);
      if (sessionHeader) {
        if (!active?.id || active.id !== sessionHeader) {
          sendJson(res, 404, { error: 'session not found' });
          return;
        }
        await active.transport.handleRequest(req, res, body);
        return;
      }

      if (req.method !== 'POST' || !isInitializeRequest(body)) {
        sendJson(res, 400, { error: 'expected an MCP initialize request' });
        return;
      }

      await replaceSession(req, res, body);
    } catch (err) {
      process.stderr.write(`[shopee-mcp] MCP HTTP error: ${err}\n`);
      sendJson(res, 500, { error: 'mcp request failed' });
    }
  };
}
