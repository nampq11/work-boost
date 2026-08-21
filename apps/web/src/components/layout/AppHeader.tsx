import React from 'react';
import { Sun, Moon, Sparkle, Circle, FolderOpen } from '@phosphor-icons/react';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';
import { Button } from '../ui/Button.tsx';

export function AppHeader() {
  const activePath = useWorkspaceStore((state) => state.activePath);
  const syncStatus = useWorkspaceStore((state) => state.syncStatus);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const toggleCopilot = useUiStore((state) => state.toggleCopilot);

  const breadcrumbs = activePath ? activePath.split('/') : [];

  return (
    <header className="h-12 border-b border-[var(--border)] bg-[var(--surface-app)] px-3.5 flex items-center justify-between select-none shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 font-semibold text-sm tracking-tight shrink-0">
          <img src="/logo.png" alt="" className="w-6 h-6 rounded-full" />
          <span>Work Boost</span>
        </div>

        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] truncate border-l border-[var(--border)] pl-3">
            <FolderOpen size={15} className="shrink-0" />
            {breadcrumbs.map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 && <span className="text-[var(--border)]">/</span>}
                <span
                  className={
                    index === breadcrumbs.length - 1
                      ? 'text-[var(--text-primary)] font-medium truncate'
                      : 'truncate'
                  }
                >
                  {part.replace(/\.(md|html)$/, '')}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Sync Status Badge */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] px-2.5 py-1 rounded bg-[var(--surface-hover)]">
          <Circle
            size={7}
            weight="fill"
            className={
              syncStatus === 'connected'
                ? 'text-[var(--accent-green)]'
                : syncStatus === 'saving'
                  ? 'text-[var(--accent-orange)] animate-pulse'
                  : 'text-[var(--accent-red)]'
            }
          />
          <span className="capitalize">{syncStatus}</span>
        </div>

        {/* Theme Mode Toggle */}
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </Button>

        {/* Copilot Drawer Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleCopilot}
          className="gap-1.5 text-sm text-[var(--accent-blue)] border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/10"
        >
          <Sparkle size={14} weight="fill" />
          <span>Copilot</span>
        </Button>
      </div>
    </header>
  );
}
