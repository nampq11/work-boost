import { Button } from '@work-boost/ui';
import React from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { isTauri } from '../../lib/tauri.ts';
import { applyUpdate, dismissUpdate } from '../../lib/update.ts';
import { useUpdateStore } from '../../store/update-store.ts';

/**
 * Slim update strip shown directly below the header when a newer desktop release exists.
 * It only renders inside the Tauri webview and only when the update-check surfaced an update
 * (`available`), is being applied (`updating`), or just failed (`error`). In a plain browser it
 * renders nothing.
 */
export function UpdateBanner() {
  const { t } = useI18n();
  const status = useUpdateStore((state) => state.status);
  const info = useUpdateStore((state) => state.info);

  if (!isTauri() || !info) return null;
  const visible = status === 'available' || status === 'updating' || status === 'error';
  if (!visible) return null;

  const updating = status === 'updating';

  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-1.5 text-xs border-b border-[var(--border)] bg-[var(--surface-selected)] select-none shrink-0">
      <span className="font-medium text-[var(--text-primary)] truncate">
        {t('update.available', { version: info.version })}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="default"
          size="xs"
          disabled={updating}
          onClick={() => applyUpdate()}
          className="h-6 px-2.5 text-xs"
        >
          {updating ? t('update.downloading') : t('update.now')}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={updating}
          onClick={() => dismissUpdate()}
          className="h-6 px-2.5 text-xs"
        >
          {t('update.later')}
        </Button>
      </div>
    </div>
  );
}
