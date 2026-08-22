import { getApiBase, setApiBase } from './api-client.ts';
import { isTauri } from './tauri.ts';

let inFlight: Promise<string> | undefined;

async function resolveFromTauri(): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<string>('get_api_base');
}

/**
 * Resolve the API base before the app renders.
 *
 * In a Tauri webview this reads the live loopback base from the Rust shell (`get_api_base`) and
 * configures the api client, so the webview never calls through the webview origin. Outside Tauri it
 * leaves the module defaults in place (VITE_API_BASE, then the dev/prod default), so the browser shell
 * and tests keep working unchanged.
 *
 * Single-flight (concurrent callers get the same result). Rejects when running in Tauri and
 * the `get_api_base` command fails (e.g. the sidecar did not start); callers must handle rejection.
 */
export function resolveApiBase(): Promise<string> {
  if (inFlight) return inFlight;
  const pending = (async () => {
    // Use browser defaults when not running in Tauri
    if (!isTauri()) {
      return getApiBase();
    }

    // In Tauri, fetch the loopback sidecar base from Rust
    const tauriBase = await resolveFromTauri();
    if (tauriBase) setApiBase(tauriBase);
    return getApiBase();
  })();
  inFlight = pending.catch((error) => {
    inFlight = undefined;
    throw error;
  });
  return inFlight;
}