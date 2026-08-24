import React from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function StatusBar() {
  const { t } = useI18n();
  const document = useWorkspaceStore((state) => state.activeDocument);
  const draft = useWorkspaceStore((state) => state.draft);
  const isDirty = useWorkspaceStore((state) => state.isDirty);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <footer className="h-7 border-t border-[var(--border)] bg-[var(--surface-sidebar)] px-3.5 flex items-center gap-3 text-xs text-[var(--text-muted)] select-none shrink-0 font-mono outline-none focus:outline-none relative z-10">
      <span>UTF-8</span>
      <span className="text-[var(--border)]">|</span>
      <span>Markdown</span>
      <span className="text-[var(--border)]">|</span>
      <span>{t('statusBar.words', { count: words })}</span>
      <span>{t('statusBar.chars', { count: draft.length })}</span>

      <div className="flex-1" />

      <span className={isDirty ? 'text-[var(--accent-orange)] font-medium' : ''}>
        {isDirty
          ? t('statusBar.unsaved')
          : document?.lastSavedAt
            ? t('statusBar.savedAt', {
                time: document.lastSavedAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : t('statusBar.ready')}
      </span>
    </footer>
  );
}
