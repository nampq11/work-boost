import { Button } from '@work-boost/ui';
import React from 'react';
import { type Translate, useI18n } from '../../lib/i18n.tsx';
import { isTauri } from '../../lib/tauri.ts';
import { applyUpdate, dismissUpdate, openManualInstall } from '../../lib/update.ts';
import { type UpdatePhase, useUpdateStore } from '../../store/update-store.ts';

function phaseMessage(phase: UpdatePhase | null, t: Translate): string {
  switch (phase) {
    case 'waiting-permission':
      return t('update.waitingPermission');
    case 'downloading':
      return t('update.downloading');
    case 'installing':
      return t('update.installing');
    case 'restarting':
      return t('update.restarting');
    default:
      return t('update.inProgress');
  }
}

/**
 * Slim update strip shown directly below the header when a newer desktop release exists.
 * It only renders inside the Tauri webview and only when the update-check surfaced an update
 * (`available`), is being applied (`updating`), or just failed (`error`). In a plain browser it
 * renders nothing.
 */
export function UpdateBanner() {
  const { t } = useI18n();
  const status = useUpdateStore((state) => state.status);
  const phase = useUpdateStore((state) => state.phase);
  const info = useUpdateStore((state) => state.info);
  const error = useUpdateStore((state) => state.error);

  if (!isTauri() || !info) return null;
  const visible = status === 'available' || status === 'updating' || status === 'error';
  if (!visible) return null;

  const updating = status === 'updating';
  const failed = status === 'error';

  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-1.5 text-xs border-b border-[var(--border)] bg-[var(--surface-selected)] select-none shrink-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        {updating ? (
          <>
            <span className="font-medium text-[var(--text-primary)] truncate">
              {phaseMessage(phase, t)}
            </span>
            {phase === 'waiting-permission' && (
              <span className="text-[var(--text-secondary)] truncate">
                {t('update.permissionHint')}
              </span>
            )}
            <span className="text-[var(--text-secondary)] truncate">
              {t('update.willRestart')} {t('update.doNotQuit')}
            </span>
          </>
        ) : (
          <span className="font-medium text-[var(--text-primary)] truncate">
            {failed
              ? t('update.failed', { message: error ?? '' })
              : t('update.available', { version: info.version })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {status === 'available' && (
          <>
            <Button
              variant="default"
              size="xs"
              onClick={() => applyUpdate()}
              className="h-6 px-2.5 text-xs"
            >
              {t('update.now')}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => dismissUpdate()}
              className="h-6 px-2.5 text-xs"
            >
              {t('update.later')}
            </Button>
          </>
        )}
        {updating && (
          <Button variant="ghost" size="xs" disabled className="h-6 px-2.5 text-xs">
            {t('update.inProgress')}
          </Button>
        )}
        {failed && (
          <>
            <Button
              variant="default"
              size="xs"
              onClick={() => applyUpdate()}
              className="h-6 px-2.5 text-xs"
            >
              {t('update.retry')}
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => openManualInstall()}
              className="h-6 px-2.5 text-xs"
            >
              {t('update.manualInstall')}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => dismissUpdate()}
              className="h-6 px-2.5 text-xs"
            >
              {t('update.later')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
