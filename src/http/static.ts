import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Resolve a URL path inside `root`, or undefined when it escapes the root. */
export function resolveSafePath(root: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '');
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) return undefined;
  const relative = decoded.replace(/^\/+/, '');
  const rootResolved = path.resolve(root);
  const file = path.resolve(rootResolved, relative);
  if (file !== rootResolved && !file.startsWith(rootResolved + path.sep)) return undefined;
  return file;
}

/** Serve one file from `root`. Returns false when the URL is not a real file there. */
export async function serveStatic(
  root: string,
  urlPath: string,
  res: ServerResponse,
): Promise<boolean> {
  const file = resolveSafePath(root, urlPath);
  if (!file || file === path.resolve(root)) return false;
  let info;
  try {
    info = await stat(file);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': info.size,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on('error', reject)
      .on('end', () => resolve())
      .pipe(res);
  });
  return true;
}
