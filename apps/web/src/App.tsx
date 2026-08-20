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
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
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
        void trash(currentPath).then(({ trashId, originalPath }) => {
          showToast(`Moved ${originalPath} to trash.`, {
            label: 'Undo',
            run: () => void restore(trashId),
          });
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
          {error && <div className="conflict-banner">{error}</div>}
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
