import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  basicAuthorized,
  bearerAuthorized,
  headerValue,
  httpAuthConfig,
  httpListenPort,
} from './access.js';
import { createMcpHttpHandler } from './mcp-route.js';
import { serveStatic } from './static.js';

const LANDING_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex">
  <title>Shopee MCP</title>
  <style>
    body { font-family: sans-serif; margin: 2rem auto; max-width: 40rem; line-height: 1.45; }
    a.button { display: inline-block; background: #ee4d2d; color: #fff; padding: 0.75rem 1.1rem;
      text-decoration: none; border-radius: 6px; }
    code { background: #f4f4f4; padding: 0.1rem 0.3rem; }
  </style>
</head>
<body>
  <h1>Shopee MCP</h1>
  <p>Abra o navegador, entre na sua conta da Shopee e conclua o OTP ou o captcha.
  A sessão fica gravada no volume e o servidor passa a usar esse login.</p>
  <p><a class="button" href="/vnc.html?autoconnect=1&amp;resize=scale&amp;path=websockify">Abrir o navegador</a></p>
  <p>Ao abrir, o site pede o usuário e a senha da interface (<code>UI_USER</code> / <code>UI_PASSWORD</code>).
  Dentro da tela, o VNC pede <code>VNC_PASSWORD</code> (até 8 caracteres).</p>
  <p>O cliente MCP conecta em <code>/mcp</code> com o header
  <code>Authorization: Bearer</code> e o valor de <code>MCP_AUTH_TOKEN</code>.</p>
</body>
</html>`;

function sendText(
  res: ServerResponse,
  status: number,
  type: string,
  body: string,
  extra?: Record<string, string>,
): void {
  res.writeHead(status, { 'content-type': type, ...extra });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4_000_000) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function proxyWebSocket(req: IncomingMessage, socket: Duplex, head: Buffer, port: number): void {
  const upstream = net.connect(port, '127.0.0.1', () => {
    const lines = [`GET ${req.url ?? '/websockify'} HTTP/1.1`];
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || key.toLowerCase() === 'host') continue;
      lines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
    lines.push(`Host: 127.0.0.1:${port}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const fail = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on('error', fail);
  socket.on('error', fail);
}

/** Listen for the noVNC UI and the MCP Streamable HTTP endpoint on one port. */
export async function startHttpServer(mcp: McpServer): Promise<void> {
  const auth = httpAuthConfig(process.env);
  const port = httpListenPort(process.env.MCP_PORT);
  const webRoot = process.env.NOVNC_WEB_ROOT || '/usr/share/novnc';
  const websockifyPort = httpListenPort(process.env.WEBSOCKIFY_PORT, 6080);
  const handleMcp = createMcpHttpHandler(mcp);

  const httpServer = createServer((req, res) => {
    void route(req, res);
  });
  httpServer.requestTimeout = 0;
  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname !== '/websockify') {
      socket.destroy();
      return;
    }
    if (!basicAuthorized(headerValue(req.headers.authorization), auth.user, auth.password)) {
      socket.write(
        'HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="Shopee MCP"\r\nConnection: close\r\n\r\n',
      );
      socket.destroy();
      return;
    }
    proxyWebSocket(req, socket, head, websockifyPort);
  });

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const pathname =
        new URL(req.url ?? '/', 'http://127.0.0.1').pathname.replace(/\/+$/, '') || '/';
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/health') {
        sendText(res, 200, 'application/json', '{"ok":true}\n');
        return;
      }

      // Public so a platform health check on "/" does not restart the container.
      // The browser itself stays behind basic auth.
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/') {
        sendText(res, 200, 'text/html; charset=utf-8', LANDING_HTML);
        return;
      }

      if (pathname === '/mcp') {
        if (!bearerAuthorized(headerValue(req.headers.authorization), auth.token)) {
          sendText(res, 401, 'application/json', '{"error":"unauthorized"}\n');
          return;
        }
        const body = req.method === 'GET' ? undefined : await readBody(req);
        await handleMcp(req, res, body);
        return;
      }

      if (!basicAuthorized(headerValue(req.headers.authorization), auth.user, auth.password)) {
        sendText(res, 401, 'text/plain; charset=utf-8', 'auth required\n', {
          'www-authenticate': 'Basic realm="Shopee MCP"',
        });
        return;
      }

      if (req.method === 'GET' && (await serveStatic(webRoot, pathname, res))) return;
      sendText(res, 404, 'text/plain; charset=utf-8', 'not found\n');
    } catch (err) {
      process.stderr.write(`[shopee-mcp] HTTP error: ${err}\n`);
      if (!res.headersSent) sendText(res, 400, 'application/json', '{"error":"bad request"}\n');
    }
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '0.0.0.0', () => resolve());
  });
  process.stderr.write(
    `[shopee-mcp] HTTP listening on :${port} (UI /, MCP /mcp, health /health)\n`,
  );
}
