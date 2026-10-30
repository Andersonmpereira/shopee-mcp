import fs from 'node:fs';
import path from 'node:path';

const LOCK_NAMES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'] as const;

/**
 * Chrome writes these into the profile and records the container hostname.
 * A redeploy looks like "another computer" and refuses to open the window
 * until the stale lock is removed.
 */
export function clearProfileLocks(profileDir: string): string[] {
  const removed: string[] = [];
  for (const name of LOCK_NAMES) {
    const file = path.join(profileDir, name);
    let detail = name;
    try {
      if (fs.lstatSync(file).isSymbolicLink()) {
        detail = `${name} -> ${fs.readlinkSync(file)}`;
      }
      fs.unlinkSync(file);
      removed.push(detail);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue;
      process.stderr.write(`[shopee-mcp] Could not remove ${file}: ${err}\n`);
    }
  }
  return removed;
}
