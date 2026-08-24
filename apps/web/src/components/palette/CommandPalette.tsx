import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api-client.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function CommandPalette() {
  const { t } = useI18n();
  const open = useUiStore((state) => state.paletteOpen);
  const close = useUiStore((state) => state.closePalette);
  const closeCopilot = useUiStore((state) => state.closeCopilot);
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
  function openFile(path: string, force = false): void {
    closeCopilot();
    void selectFile(path, force);
    close();
  }
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
      openFile(path, true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('commandPalette.unableCreateDaily'));
    }
  }
  async function createDebt() {
    const personName = window.prompt(t('commandPalette.personNamePrompt'));
    if (!personName) return;
    const amount = Number(window.prompt(t('commandPalette.amountPrompt')));
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      const result = (await api.createDebt({ personName, amount, direction: 'lent' })) as {
        filePath?: string;
      };
      await loadFiles();
      if (result.filePath) {
        openFile(result.filePath, true);
      } else {
        close();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('commandPalette.unableCreateDebt'));
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
          placeholder={t('commandPalette.placeholder')}
        />
        <div className="palette-list">
          <button onClick={() => void createDaily()}>
            <strong>{t('commandPalette.createDaily')}</strong>
            <span>{t('commandPalette.today')}</span>
          </button>
          <button onClick={() => void createDebt()}>
            <strong>{t('commandPalette.createDebt')}</strong>
            <span>{t('commandPalette.openForm')}</span>
          </button>
          {files.map((node) => (
            <button key={node.path} onClick={() => openFile(node.path)}>
              <strong>{node.name}</strong>
              <span>{node.path}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
