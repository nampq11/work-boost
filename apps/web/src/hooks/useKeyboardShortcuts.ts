import { useEffect } from 'react';
import { useUiStore } from '../store/ui-store.ts';
import { useWorkspaceStoreApi } from '../store/workspace-store.ts';

export function useKeyboardShortcuts() {
  const openPalette = useUiStore((state) => state.openPalette);
  const showToast = useUiStore((state) => state.showToast);
  const storeApi = useWorkspaceStoreApi();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Command palette
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
        return;
      }
      // Manual save: works whether or not autosave is on, and is useful right
      // after a keystroke before the autosave debounce fires (e.g. before
      // switching files). Prevents the browser's default save dialog.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        const { activePath, save } = storeApi.getState();
        if (!activePath) return;
        void save().catch((error) => {
          showToast(error instanceof Error ? error.message : 'Unable to save changes');
        });
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [openPalette, showToast]);
}
