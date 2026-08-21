import React from 'react';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function StatusBar() {
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
      <span>{words} words</span>
      <span>({draft.length} chars)</span>

      <div className="flex-1" />

      <span className={isDirty ? 'text-[var(--accent-orange)] font-medium' : ''}>
        {isDirty
          ? '● Unsaved changes'
          : document?.lastSavedAt
            ? `Saved at ${document.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Ready'}
      </span>
    </footer>
  );
}
