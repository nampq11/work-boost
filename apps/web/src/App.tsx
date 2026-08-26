import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from '@work-boost/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { AiCopilotDrawer } from './components/ai/AiCopilotDrawer.tsx';
import { EditorContainer } from './components/editor/EditorContainer.tsx';
import { AppHeader } from './components/layout/AppHeader.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { StatusBar } from './components/layout/StatusBar.tsx';
import { UpdateBanner } from './components/layout/UpdateBanner.tsx';
import { CommandPalette } from './components/palette/CommandPalette.tsx';
import { Toast } from './components/ui/Toast.tsx';
import { HtmlAppViewer } from './components/viewer/HtmlAppViewer.tsx';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { useWorkspaceSync } from './hooks/useWorkspaceSync.ts';
import { useI18n } from './lib/i18n.tsx';
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  defaultSidebarWidth,
} from './lib/sidebar-constants.ts';
import { useUpdateChecker } from './lib/update.ts';
import { useUiStore } from './store/ui-store.ts';
import { useWorkspaceStore } from './store/workspace-store.ts';

export function App() {
  const { t } = useI18n();
  useWorkspaceSync();
  useKeyboardShortcuts();
  useUpdateChecker();
  const activePath = useWorkspaceStore((state) => state.activePath);
  const error = useWorkspaceStore((state) => state.error);
  const trash = useWorkspaceStore((state) => state.trash);
  const restore = useWorkspaceStore((state) => state.restore);
  const theme = useUiStore((state) => state.theme);
  const copilotOpen = useUiStore((state) => state.copilotOpen);
  const showToast = useUiStore((state) => state.showToast);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'workboost-workspace-layout',
    panelIds: ['sidebar', 'main', 'copilot'],
    onlySaveAfterUserInteractions: true,
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
  });
  // Freeze the mount-time layout: the Group only reads defaultLayout on
  // mount, and a fresh object identity later would re-trigger layout logic.
  const [initialLayout] = useState(defaultLayout);
  // Resizable panels read defaultSize on mount only; a stable mount-time
  // snapshot keeps the width viewport-derived without re-render churn.
  const sidebarDefaultSize = useMemo(() => defaultSidebarWidth(window.innerWidth), []);
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
        const toasts = useUiStore.getState().toasts;
        const actionToast = [...toasts].reverse().find((toast) => toast.action);
        if (actionToast?.action) {
          event.preventDefault();
          actionToast.action.run();
          useUiStore.getState().dismissToast(actionToast.id);
          return;
        }
      }
      if (event.key === 'Delete' && currentPath) {
        event.preventDefault();
        void trash(currentPath)
          .then(({ trashId, originalPath }) => {
            showToast(t('toast.movedToTrash', { path: originalPath }), {
              label: t('toast.undo'),
              run: () =>
                void restore(trashId).catch((error) => {
                  showToast(error instanceof Error ? error.message : t('toast.unableRestore'));
                }),
            });
          })
          .catch((error) => {
            showToast(error instanceof Error ? error.message : t('toast.unableMoveToTrash'));
          });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [restore, showToast, trash]);
  return (
    <div className="app-shell">
      <AppHeader />
      <UpdateBanner />
      <div className="app-body">
        <ResizablePanelGroup
          id="workboost-workspace"
          orientation="horizontal"
          defaultLayout={initialLayout}
          onLayoutChanged={onLayoutChanged}
          className="min-w-0 flex-1"
        >
          <ResizablePanel
            id="sidebar"
            defaultSize={sidebarDefaultSize}
            minSize={SIDEBAR_MIN_WIDTH}
            maxSize={SIDEBAR_MAX_WIDTH}
            className="min-w-0"
          >
            <Sidebar />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="main" minSize={0} className="min-w-0">
            <main className="main-viewport">
              {error && (
                <div className="mx-6 mt-4 p-3 rounded-lg border border-[var(--accent-red)] bg-[#fee2e2] text-[#991b1b] text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t('app.workspaceConnectionError')}</span>
                    <span>{error}</span>
                  </div>
                  <button
                    onClick={() => void useWorkspaceStore.getState().loadFiles()}
                    className="underline font-medium hover:opacity-80"
                  >
                    {t('app.retry')}
                  </button>
                </div>
              )}
              {activePath?.toLowerCase().endsWith('.html') ? (
                <HtmlAppViewer path={activePath} />
              ) : (
                <EditorContainer />
              )}
            </main>
          </ResizablePanel>
          {copilotOpen && <ResizableHandle withHandle />}
          <AiCopilotDrawer />
        </ResizablePanelGroup>
      </div>
      <StatusBar />
      <CommandPalette />
      <Toast />
    </div>
  );
}
