import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { type UpdateInfo, type UpdatePhase, useUpdateStore } from '../store/update-store.ts';
import { openExternalUrl } from './external-url.ts';
import { isTauri } from './tauri.ts';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const RELEASES_URL = 'https://github.com/nampq11/work-boost/releases/latest';

function snoozeKey(version: string): string {
  return `workboost:update-snooze-${version}`;
}

// "Later" snoozes one version for 7 days. A NEWER version has its own key, so it is not suppressed
// by a previously snoozed (older) release.
function isSnoozed(info: UpdateInfo): boolean {
  try {
    const snoozed = Number(localStorage.getItem(snoozeKey(info.version)) ?? '0');
    return snoozed > 0 && Date.now() - snoozed < SEVEN_DAYS_MS;
  } catch {
    return false;
  }
}

/**
 * Desktop-only bootstrap and installer-event wiring. In a plain browser it is inert and never calls
 * `invoke` or `listen`. On mount it runs the one-shot update check and subscribes to the Rust
 * installer's `update:phase` / `update:error` events so the banner can show live install progress.
 * Check errors are swallowed by Rust as `null` and never become `error`.
 */
export function useUpdateChecker(): void {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    useUpdateStore.getState().setChecking();

    (async () => {
      try {
        const result = await invoke<UpdateInfo | null>('check_for_update');
        if (disposed) return;
        if (!result || isSnoozed(result)) {
          useUpdateStore.getState().setIdle();
          return;
        }
        useUpdateStore.getState().setAvailable(result);
      } catch {
        // A check failure is swallowed; it is never surfaced as `error`.
        if (!disposed) useUpdateStore.getState().setIdle();
      }
    })();

    // The install runs on a Rust background thread and streams these events. Failure
    // handling is delegated here so the banner can offer a retry/manual path.
    let unsubPhase: (() => void) | undefined;
    let unsubError: (() => void) | undefined;
    void listen<{ phase: UpdatePhase }>('update:phase', (event) => {
      if (disposed) return;
      useUpdateStore.getState().setPhase(event.payload.phase);
    }).then((unsub) => {
      unsubPhase = unsub;
    });
    void listen<{ message: string }>('update:error', (event) => {
      if (disposed) return;
      useUpdateStore.getState().setError(event.payload.message);
    }).then((unsub) => {
      unsubError = unsub;
    });

    return () => {
      disposed = true;
      unsubPhase?.();
      unsubError?.();
    };
  }, []);
}

/**
 * Run the canonical installer elevated and relaunch. No URL is supplied: the install command is a
 * Rust constant. Progress and failures are delivered as `update:phase` / `update:error` events; the
 * command itself only fails for immediate setup problems or non-autoupdatable platforms, which are
 * surfaced here as `error`.
 */
export function applyUpdate(): void {
  const store = useUpdateStore.getState();
  // Guard against a double click / re-entry while an install is already running.
  if (store.status !== 'available' && store.status !== 'error') return;
  store.setUpdating();
  void (async () => {
    try {
      await invoke('apply_update');
      // The Rust command returns immediately; the app relaunches on success. phases
      // and the terminal failure arrive via events.
    } catch (cause) {
      const message = typeof cause === 'string' ? cause : String(cause);
      useUpdateStore.getState().setError(message);
    }
  })();
}

/** Open the releases page for the manual install / recovery path. */
export function openManualInstall(): void {
  void openExternalUrl(RELEASES_URL);
}

export function dismissUpdate(): void {
  const info = useUpdateStore.getState().info;
  if (info) {
    try {
      localStorage.setItem(snoozeKey(info.version), String(Date.now()));
    } catch {
      // Optional storage; ignore.
    }
  }
  useUpdateStore.getState().setIdle();
}
