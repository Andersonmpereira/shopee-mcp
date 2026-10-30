import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initAccountMode } from './account-mode.js';
import { registerAccountTools } from './tools/account.js';
import { registerActionTools } from './tools/actions.js';
import { registerCartTools } from './tools/cart.js';
import { registerFlashSaleTools } from './tools/flashsale.js';
import { registerProductTools } from './tools/product.js';
import { registerReviewTools } from './tools/reviews.js';
import { registerSearchTools } from './tools/search.js';
import { registerShopTools } from './tools/shop.js';
import { registerStatusTools } from './tools/status.js';
import { registerVariantTools } from './tools/variants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8')) as {
  version: string;
};

/** Build the MCP server with every tool group registered. Does not connect a transport. */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'shopee-mcp',
    version: pkg.version,
  });

  registerSearchTools(server);
  registerProductTools(server);
  registerVariantTools(server);
  registerStatusTools(server);
  registerReviewTools(server);
  registerShopTools(server);
  registerFlashSaleTools(server);
  // Experimental account tools start hidden. Account mode shows them once the
  // saved browser session is logged in.
  initAccountMode(server);
  registerAccountTools(server);
  registerCartTools(server);
  registerActionTools(server);

  return server;
}
