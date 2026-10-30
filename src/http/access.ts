import { timingSafeEqual } from 'node:crypto';

export type McpTransportMode = 'http' | 'stdio';

export function mcpTransportMode(raw: string | undefined): McpTransportMode {
  return raw?.trim().toLowerCase() === 'http' ? 'http' : 'stdio';
}

export function httpListenPort(raw: string | undefined, fallback = 8080): number {
  const source = raw?.trim() ? raw.trim() : String(fallback);
  const port = Number(source);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid MCP_PORT: ${source}`);
  }
  return port;
}

export type HttpAuthConfig = {
  token: string;
  user: string;
  password: string;
};

/** Secrets required before the public HTTP server will listen. */
export function httpAuthConfig(env: {
  MCP_AUTH_TOKEN?: string;
  UI_USER?: string;
  UI_PASSWORD?: string;
}): HttpAuthConfig {
  const token = env.MCP_AUTH_TOKEN?.trim() ?? '';
  const user = env.UI_USER?.trim() || 'shopee';
  const password = env.UI_PASSWORD ?? '';
  if (!token) throw new Error('MCP_AUTH_TOKEN is required when MCP_TRANSPORT=http');
  if (!password) throw new Error('UI_PASSWORD is required when MCP_TRANSPORT=http');
  return { token, user, password };
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function bearerAuthorized(authorization: string | undefined, token: string): boolean {
  return safeEqual(authorization ?? '', `Bearer ${token}`);
}

export function basicAuthorized(
  authorization: string | undefined,
  user: string,
  password: string,
): boolean {
  if (!authorization?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8');
  const split = decoded.indexOf(':');
  if (split < 0) return false;
  return safeEqual(decoded.slice(0, split), user) && safeEqual(decoded.slice(split + 1), password);
}

/** True when a Streamable HTTP body is an MCP initialize message. */
export function isInitializeRequest(body: unknown): boolean {
  if (Array.isArray(body)) return body.some((item) => isInitializeRequest(item));
  if (!body || typeof body !== 'object') return false;
  return (body as { method?: unknown }).method === 'initialize';
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
