import { ArrowsClockwise, FolderPlus, MagnifyingGlass } from '@phosphor-icons/react';
import { Button } from '@work-boost/ui';
import React, { useMemo, useState } from 'react';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';
import { NewItemDropdown } from '../ui/NewItemDropdown.tsx';
import { SidebarTree } from './SidebarTree.tsx';

export function Sidebar() {
  const nodes = useWorkspaceStore((state) => state.nodes);
  const loadFiles = useWorkspaceStore((state) => state.loadFiles);
  const createFolder = useWorkspaceStore((state) => state.createFolder);
  const [query, setQuery] = useState('');
  const [folderName, setFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const openPalette = useUiStore((state) => state.openPalette);

  const filtered = useMemo(() => {
    if (!query.trim()) return nodes;
    const needle = query.toLowerCase();
    const filter = (items: typeof nodes): typeof nodes =>
      items.flatMap((node) => {
        const children = node.children ? filter(node.children) : [];
        return node.name.toLowerCase().includes(needle) || children.length
          ? [{ ...node, children }]
          : [];
      });
    return filter(nodes);
  }, [nodes, query]);

  async function addFolder() {
    const path = folderName.trim();
    if (!path) {
      setIsCreatingFolder(false);
      return;
    }
    await createFolder(path);
    setFolderName('');
    setIsCreatingFolder(false);
  }

  return (
    <aside className="w-64 border-r border-[var(--border)] bg-[var(--surface-sidebar)] flex flex-col shrink-0 select-none">
      {/* Search Input Box */}
      <div className="p-2.5 border-b border-[var(--border)]">
        <div className="relative flex items-center">
          <MagnifyingGlass
            size={14}
            className="absolute left-2.5 text-[var(--text-muted)] pointer-events-none"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes..."
            className="w-full bg-[var(--surface-app)] border border-[var(--border)] rounded h-8 pl-8 pr-14 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] placeholder:text-[var(--text-secondary)]"
          />
          <kbd className="absolute right-1.5 text-[10px] text-[var(--text-secondary)] bg-[var(--surface-hover)] px-1.5 rounded">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="p-2.5 border-b border-[var(--border)] flex items-center gap-1">
        <NewItemDropdown onNewNote={openPalette} onNewDebt={openPalette} />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCreatingFolder(true)}
          title="New folder"
        >
          <FolderPlus size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void loadFiles()}
          title="Refresh workspace"
        >
          <ArrowsClockwise size={15} />
        </Button>
      </div>

      {/* Inline Create Folder */}
      {isCreatingFolder && (
        <div className="p-2.5 border-b border-[var(--border)] bg-[var(--surface-hover)]">
          <input
            autoFocus
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addFolder();
              if (event.key === 'Escape') setIsCreatingFolder(false);
            }}
            onBlur={() => void addFolder()}
            placeholder="Folder name..."
            className="w-full bg-[var(--surface-app)] border border-[var(--border)] rounded h-7 px-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
      )}

      {/* Tree Section */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 py-2 text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
          Workspace
        </div>
        <SidebarTree nodes={filtered} />
      </div>
    </aside>
  );
}
