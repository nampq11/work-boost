import React from 'react';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function AppHeader() {
  const activePath = useWorkspaceStore((state) => state.activePath);
  const syncStatus = useWorkspaceStore((state) => state.syncStatus);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const toggleCopilot = useUiStore((state) => state.toggleCopilot);
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">WB</span>
        <strong>Work Boost</strong>
      </div>
      <div className="breadcrumbs">
        workspace {activePath ? ` / ${activePath.split('/').join(' / ')}` : ''}
      </div>
      <div className="header-actions">
        <span className={`sync-dot ${syncStatus}`}>
          <i /> {syncStatus}
        </span>
        <button className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <button className="primary-button" onClick={toggleCopilot}>
          Copilot
        </button>
      </div>
    </header>
  );
}
