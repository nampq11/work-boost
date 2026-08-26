import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { useUiStore } from '../store/ui-store.ts';
import { type UpdateInfo, useUpdateStore } from '../store/update-store.ts';
import { openExternalUrl } from './external-url.ts';
import { t } from './i18n.tsx';
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
 * Desktop-only launch check. In a plain browser it is inert and never calls `invoke`. The check runs
 * once on mount; check errors are swallowed by Rust as `null` and never become `error`.
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

    return () => {
      disposed = true;
    };
  }, []);
}

/**
 * Run the canonical installer elevated and relaunch. No URL is supplied: the install command is a
 * Rust constant. A failure (elevation cancelled, install.sh non-zero exit) is surfaced as `error`
 * and a toast, and opens the releases page for the manual path.
 */
export function applyUpdate(): void {
  useUpdateStore.getState().setUpdating();
  void (async () => {
    try {
      await invoke('apply_update');
      // On success the app relaunches, so we stay in `updating`.
    } catch (cause) {
      const message = typeof cause === 'string' ? cause : String(cause);
      const label = /manual/i.test(message)
        ? t('update.manual', { message })
        : t('update.failed', { message });
      useUiStore.getState().showToast(label);
      void openExternalUrl(RELEASES_URL);
      useUpdateStore.getState().setError(message);
    }
  })();
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
