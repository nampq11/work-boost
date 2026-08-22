/**
 * Check if we're running inside a Tauri webview.
 *
 * This is a runtime check that can be used to gate Tauri-specific behavior.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}