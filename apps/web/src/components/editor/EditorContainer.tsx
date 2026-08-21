import { Code, Coins, Eye, FileText, FloppyDisk } from '@phosphor-icons/react';
import React, { useEffect, useState } from 'react';
import { useAutosave } from '../../hooks/useAutosave.ts';
import type { FileNode } from '../../lib/types.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';
import { Button } from '../ui/Button.tsx';
import { FrontmatterInspector } from './FrontmatterInspector.tsx';
import { SourceEditor } from './SourceEditor.tsx';
import { TiptapEditor } from './TiptapEditor.tsx';

export function EditorContainer() {
  const document = useWorkspaceStore((state) => state.activeDocument);
  const draft = useWorkspaceStore((state) => state.draft);
  const updateBody = useWorkspaceStore((state) => state.updateBody);
  const save = useWorkspaceStore((state) => state.save);
  const recentFiles = useWorkspaceStore((state) => state.recentFiles);
  const nodes = useWorkspaceStore((state) => state.nodes);
  const [sourceMode, setSourceMode] = useState(false);
  const openPalette = useUiStore((state) => state.openPalette);

  useAutosave();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        setSourceMode((mode) => !mode);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Get recent notes with metadata
  const recentNotes = React.useMemo(() => {
    const nodeMap = new Map<string, FileNode>();

    function traverse(items: FileNode[]) {
      for (const item of items) {
        if (item.kind !== 'folder') {
          nodeMap.set(item.path, item);
        }
        if (item.children) {
          traverse(item.children);
        }
      }
    }
    traverse(nodes);

    return Array.from(recentFiles.entries())
      .map(([path, accessedAt]) => {
        const node = nodeMap.get(path);
        if (!node) return null;
        return {
          path,
          name: node.name,
          kind: node.kind,
          accessedAt,
        };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .sort((a, b) => b.accessedAt.getTime() - a.accessedAt.getTime());
  }, [recentFiles, nodes]);

  // Empty state - Welcome Dashboard
  if (!document) {
    // If we have recent notes, show recent notes grid
    if (recentNotes.length > 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center select-none">
          <div className="w-full max-w-2xl px-8 flex flex-col gap-6 items-center">
            {/* Brand Mark */}
            <div className="flex justify-center">
              <img src="/logo.png" alt="" className="w-12 h-12 rounded-full shadow-sm" />
            </div>

            {/* Heading */}
            <div className="space-y-1 text-center">
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] m-0">
                Recent Notes
              </h2>
              <p className="text-xs text-[var(--text-secondary)] m-0">Pick up where you left off</p>
            </div>

            {/* Recent Notes Grid - centered when odd number of items */}
            <div
              className={`grid gap-2 w-full ${recentNotes.length === 1 ? 'grid-cols-1 max-w-xs' : 'grid-cols-2'}`}
            >
              {recentNotes.slice(0, 6).map((note) => {
                const displayName = note.name.replace(/\.(md|html)$/, '');
                const timeAgo = formatTimeAgo(note.accessedAt);
                const Icon =
                  note.kind === 'debt' || note.kind === 'debt-archive' ? Coins : FileText;
                const iconColor =
                  note.kind === 'debt' || note.kind === 'debt-archive'
                    ? 'text-[var(--accent-green)]'
                    : 'text-[var(--text-muted)]';

                return (
                  <button
                    key={note.path}
                    type="button"
                    onClick={() => void useWorkspaceStore.getState().selectFile(note.path)}
                    className="flex flex-col items-start p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-sidebar)] hover:border-[var(--text-muted)] transition-colors cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} className={iconColor} />
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">
                        {displayName}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">{timeAgo}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="flex justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={openPalette} className="gap-1.5">
                <span>New Note</span>
              </Button>
              <Button variant="outline" size="sm" onClick={openPalette} className="gap-1.5">
                <span>New Debt</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Empty workspace state - Welcome Dashboard
    return (
      <div className="h-full flex flex-col items-center justify-center text-center select-none">
        <div className="max-w-md px-8 flex flex-col gap-6">
          {/* Brand Mark Icon */}
          <div className="flex justify-center">
            <img src="/logo.png" alt="" className="w-12 h-12 rounded-full shadow-sm" />
          </div>

          {/* Heading */}
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] m-0">
              Welcome to Work Boost
            </h2>
            <p className="text-xs text-[var(--text-secondary)] m-0">
              Your personal workspace & productivity hub
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              type="button"
              onClick={openPalette}
              className="flex flex-col items-start gap-1 p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-sidebar)] hover:border-[var(--text-muted)] transition-all text-left group cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2 font-semibold text-xs text-[var(--text-primary)]">
                <FileText size={16} className="text-[var(--accent-blue)]" />
                <span>New Note</span>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Write daily notes or docs
              </span>
            </button>

            <button
              type="button"
              onClick={openPalette}
              className="flex flex-col items-start gap-1 p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-sidebar)] hover:border-[var(--text-muted)] transition-all text-left group cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2 font-semibold text-xs text-[var(--text-primary)]">
                <Coins size={16} className="text-[var(--accent-green)]" />
                <span>New Debt</span>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Track lent or borrowed money
              </span>
            </button>
          </div>

          {/* Shortcut Hint */}
          <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1.5 pt-2">
            <span>Press</span>
            <kbd className="bg-[var(--surface-sidebar)] px-1.5 py-0.5 rounded border border-[var(--border)] font-mono text-[10px] text-[var(--text-secondary)]">
              Ctrl + K
            </kbd>
            <span>to search anything</span>
          </div>
        </div>
      </div>
    );
  }

  const title =
    document.path
      .split('/')
      .pop()
      ?.replace(/\.(md|html)$/, '') ?? '';

  return (
    <div className="max-w-4xl mx-auto px-10 py-10">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 mb-6 border-b border-[var(--border)]">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] m-0">
          {title}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSourceMode(!sourceMode)}
            className="gap-1.5 text-sm"
          >
            {sourceMode ? <Eye size={14} /> : <Code size={14} />}
            <span>{sourceMode ? 'WYSIWYG' : 'Raw Source'}</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void save().catch(() => undefined)}
            className="gap-1.5 bg-[var(--text-primary)] text-[var(--text-inverse)] hover:opacity-90"
          >
            <FloppyDisk size={14} />
            <span>Save</span>
          </Button>
        </div>
      </div>

      {/* Frontmatter Inspector */}
      <FrontmatterInspector />

      {/* Editor Body */}
      {sourceMode ? (
        <SourceEditor value={draft} onChange={updateBody} />
      ) : (
        <TiptapEditor value={draft} onChange={updateBody} />
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
