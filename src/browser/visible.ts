import { accountToolsSetting, refreshAccountMode } from '../account-mode.js';
import { ensureVisibleBrowser } from './session.js';

const POLL_MS = 5000;

/**
 * Show the Shopee window on the virtual display and, while signed out, watch
 * the profile cookies so account tools turn on after the manual login.
 */
export function openVisibleSession(): void {
  void run().catch((err) => {
    process.stderr.write(`[shopee-mcp] Browser startup failed: ${err}\n`);
  });
}

async function run(): Promise<void> {
  let loggedIn = false;
  try {
    loggedIn = await ensureVisibleBrowser();
  } catch (err) {
    process.stderr.write(`[shopee-mcp] Could not open the Shopee window: ${err}\n`);
  }

  if (accountToolsSetting() === 'auto') await refreshAccountMode();

  if (loggedIn) {
    process.stderr.write('[shopee-mcp] Shopee session is logged in.\n');
    return;
  }

  process.stderr.write(
    '[shopee-mcp] Shopee session is signed out. Open the browser UI and log in once.\n',
  );
  if (accountToolsSetting() !== 'auto') return;

  const timer = setInterval(() => {
    void refreshAccountMode()
      .then((active) => {
        if (!active) return;
        clearInterval(timer);
        process.stderr.write('[shopee-mcp] Login detected. Account tools enabled.\n');
      })
      .catch(() => undefined);
  }, POLL_MS);
  timer.unref();
}
