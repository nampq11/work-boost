import React from 'react';
import { useEffect } from 'react';
import { AiCopilotDrawer } from './components/ai/AiCopilotDrawer.tsx';
import { EditorContainer } from './components/editor/EditorContainer.tsx';
import { AppHeader } from './components/layout/AppHeader.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { StatusBar } from './components/layout/StatusBar.tsx';
import { CommandPalette } from './components/palette/CommandPalette.tsx';
import { Toast } from './components/ui/Toast.tsx';
import { HtmlAppViewer } from './components/viewer/HtmlAppViewer.tsx';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { useWorkspaceSync } from './hooks/useWorkspaceSync.ts';
import { useUiStore } from './store/ui-store.ts';
import { useWorkspaceStore } from './store/workspace-store.ts';

export function App() {
  useWorkspaceSync();
  useKeyboardShortcuts();
  const activePath = useWorkspaceStore((state) => state.activePath);
  const error = useWorkspaceStore((state) => state.error);
  const trash = useWorkspaceStore((state) => state.trash);
  const restore = useWorkspaceStore((state) => state.restore);
  const theme = useUiStore((state) => state.theme);
  const showToast = useUiStore((state) => state.showToast);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      )
        return;
      const currentPath = useWorkspaceStore.getState().activePath;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        const toast = useUiStore.getState().toast;
        if (toast?.action) {
          event.preventDefault();
          toast.action.run();
          useUiStore.getState().dismissToast();
          return;
        }
      }
      if (event.key === 'Delete' && currentPath) {
        event.preventDefault();
        void trash(currentPath)
          .then(({ trashId, originalPath }) => {
            showToast(`Moved ${originalPath} to trash.`, {
              label: 'Undo',
              run: () =>
                void restore(trashId).catch((error) => {
                  showToast(error instanceof Error ? error.message : 'Unable to restore file.');
                }),
            });
          })
          .catch((error) => {
            showToast(error instanceof Error ? error.message : 'Unable to move file to trash.');
          });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [restore, showToast, trash]);
  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-body">
        <Sidebar />
        <main className="main-viewport">
          {error && (
            <div className="mx-6 mt-4 p-3 rounded-lg border border-[var(--accent-red)] bg-[#fee2e2] text-[#991b1b] text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Lỗi kết nối workspace:</span>
                <span>{error}</span>
              </div>
              <button
                onClick={() => void useWorkspaceStore.getState().loadFiles()}
                className="underline font-medium hover:opacity-80"
              >
                Thử lại
              </button>
            </div>
          )}
          {activePath?.toLowerCase().endsWith('.html') ? (
            <HtmlAppViewer path={activePath} />
          ) : (
            <EditorContainer />
          )}
        </main>
        <AiCopilotDrawer />
      </div>
      <StatusBar />
      <CommandPalette />
      <Toast />
    </div>
  );
}
