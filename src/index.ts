#!/usr/bin/env node
import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { accountToolsSetting, refreshAccountMode } from './account-mode.js';
import { openVisibleSession } from './browser/visible.js';
import { closeContext, DEBUG } from './browser/session.js';
import { mcpTransportMode } from './http/access.js';
import { startHttpServer } from './http/server.js';
import { createMcpServer } from './server.js';

async function main() {
  const server = createMcpServer();

  if (mcpTransportMode(process.env.MCP_TRANSPORT) === 'http') {
    await startHttpServer(server);
    if (process.env.SHOPEE_ENSURE_VISIBLE === 'true') openVisibleSession();
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (process.env.SHOPEE_ENSURE_VISIBLE === 'true') {
    openVisibleSession();
  } else if (accountToolsSetting() === 'auto') {
    void refreshAccountMode();
  }

  if (DEBUG) {
    process.stderr.write('[shopee-mcp] Server started via stdio (browser-backed discovery)\n');
  }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void closeContext().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  process.stderr.write(`[shopee-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
