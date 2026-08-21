import { Clock, Coins, FileText } from '@phosphor-icons/react';
import React from 'react';
import { formatNodeDisplayName, getSidebarItemColorClass } from '../../lib/sidebar-constants.ts';
import type { FileNode } from '../../lib/types.ts';
import { useUiStore } from '../../store/ui-store.ts';

interface RecentNote {
  path: string;
  name: string;
  kind: FileNode['kind'];
  accessedAt: Date;
}

export function RecentNotes({ notes }: { notes: RecentNote[] }) {
  const openPalette = useUiStore((state) => state.openPalette);

  if (notes.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-lg">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={16} className="text-[var(--text-secondary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Recent Notes
        </h3>
      </div>
      <div className="space-y-2">
        {notes.slice(0, 8).map((note) => {
          const colorClass = getSidebarItemColorClass({
            kind: note.kind,
            name: note.name,
            path: note.path,
            relativePath: note.path,
          } as FileNode);
          const displayName = formatNodeDisplayName({
            kind: note.kind,
            name: note.name,
            path: note.path,
            relativePath: note.path,
          } as FileNode);
          const Icon = note.kind === 'debt' || note.kind === 'debt-archive' ? Coins : FileText;

          return (
            <button
              key={note.path}
              type="button"
              onClick={openPalette}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-left"
            >
              <Icon size={18} className={colorClass} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {displayName}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {formatTimeAgo(note.accessedAt)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
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
