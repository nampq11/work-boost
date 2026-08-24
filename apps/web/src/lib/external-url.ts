import { isTauri } from './tauri.ts';

/**
 * Open a URL in the system browser.
 *
 * Inside a Tauri webview the opener plugin hands the URL to the OS browser (so the OAuth flow opens
 * outside the app). Outside Tauri (browser dev, tests, static build) it falls back to a new tab.
 */
export async function openExternalUrl(url: string): Promise<void> {
  // Use browser fallback when not running in Tauri
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  // In Tauri, open in the system browser via the opener plugin
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}
