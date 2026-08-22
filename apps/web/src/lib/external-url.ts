/**
 * Open a URL in the system browser.
 *
 * Inside a Tauri webview the opener plugin hands the URL to the OS browser (so the OAuth flow opens
 * outside the app). Outside Tauri (browser dev, tests, static build) it falls back to a new tab.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  } catch {
    // Not running inside a Tauri webview; open in a new browser tab instead.
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
