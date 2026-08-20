import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api-client.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const close = useUiStore((state) => state.closePalette);
  const showToast = useUiStore((state) => state.showToast);
  const loadFiles = useWorkspaceStore((state) => state.loadFiles);
  const selectFile = useWorkspaceStore((state) => state.selectFile);
  const nodes = useWorkspaceStore((state) => state.nodes);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  const files = useMemo(
    () =>
      nodes
        .flatMap(function flatten(node): typeof nodes {
          return node.children ? [node, ...node.children.flatMap(flatten)] : [node];
        })
        .filter(
          (node) => node.kind !== 'folder' && node.name.toLowerCase().includes(query.toLowerCase()),
        ),
    [nodes, query],
  );
  if (!open) return null;
  async function createDaily() {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const path = `daily/${date}.md`;
    try {
      await api.createFile(path, '', { date, type: 'daily' });
      await loadFiles();
      await selectFile(path, true);
      close();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to create daily note');
    }
  }
  async function createDebt() {
    const personName = window.prompt('Person name');
    if (!personName) return;
    const amount = Number(window.prompt('Amount'));
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      const result = (await api.createDebt({ personName, amount, direction: 'lent' })) as {
        filePath?: string;
      };
      await loadFiles();
      if (result.filePath) await selectFile(result.filePath, true);
      close();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to create debt');
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section className="palette" role="dialog" aria-modal="true">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a command or search files..."
        />
        <div className="palette-list">
          <button onClick={() => void createDaily()}>
            <strong>Create daily note</strong>
            <span>Today</span>
          </button>
          <button onClick={() => void createDebt()}>
            <strong>Create debt</strong>
            <span>Open form</span>
          </button>
          {files.map((node) => (
            <button
              key={node.path}
              onClick={() => {
                void selectFile(node.path);
                close();
              }}
            >
              <strong>{node.name}</strong>
              <span>{node.path}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
