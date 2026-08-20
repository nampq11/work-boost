import React from 'react';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function StatusBar() {
  const document = useWorkspaceStore((state) => state.activeDocument);
  const draft = useWorkspaceStore((state) => state.draft);
  const isDirty = useWorkspaceStore((state) => state.isDirty);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  return (
    <footer className="status-bar">
      <span>UTF-8</span>
      <span>Markdown</span>
      <span>{words} words</span>
      <span>{draft.length} chars</span>
      <span className="status-spacer" />
      <span>
        {isDirty
          ? 'Unsaved draft'
          : document?.lastSavedAt
            ? `Saved ${document.lastSavedAt.toLocaleTimeString()}`
            : 'Ready'}
      </span>
    </footer>
  );
}
