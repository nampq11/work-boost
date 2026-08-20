import React from 'react';
import { useMemo, useState } from 'react';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';
import { SidebarTree } from './SidebarTree.tsx';

export function Sidebar() {
  const nodes = useWorkspaceStore((state) => state.nodes);
  const loadFiles = useWorkspaceStore((state) => state.loadFiles);
  const createFolder = useWorkspaceStore((state) => state.createFolder);
  const [query, setQuery] = useState('');
  const [folderName, setFolderName] = useState('');
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
    if (!path) return;
    await createFolder(path);
    setFolderName('');
  }
  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <span>Search</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a file..."
        />
        <kbd>Ctrl K</kbd>
      </div>
      <div className="sidebar-actions">
        <button onClick={openPalette}>New note</button>
        <button onClick={openPalette}>New debt</button>
        <button onClick={addFolder}>Folder</button>
      </div>
      <div className="folder-create">
        <input
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void addFolder()}
          placeholder="folder/path (optional)"
        />
        <button onClick={() => void loadFiles()} aria-label="Refresh">
          ↻
        </button>
      </div>
      <div className="tree-heading">Workspace</div>
      <SidebarTree nodes={filtered} />
    </aside>
  );
}
