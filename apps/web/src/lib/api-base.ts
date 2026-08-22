import { getApiBase, setApiBase } from './api-client.ts';

let inFlight: Promise<string> | undefined;

async function resolveFromTauri(): Promise<string | undefined> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('get_api_base');
  } catch {
    // Not running inside a Tauri webview (browser dev, tests, static build). Leave the default base.
    return undefined;
  }
}

/**
 * Resolve the API base before the app renders.
 *
 * In a Tauri webview this reads the live loopback base from the Rust shell (`get_api_base`) and
 * configures the api client, so the webview never calls through the webview origin. Outside Tauri it
 * leaves the module defaults in place (VITE_API_BASE, then the dev/prod default), so the browser shell
 * and tests keep working unchanged.
 *
 * Single-flight (concurrent callers get the same result) and never rejects.
 */
export function resolveApiBase(): Promise<string> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const tauriBase = await resolveFromTauri();
    if (tauriBase) setApiBase(tauriBase);
    return getApiBase();
  })();
  return inFlight;
}
