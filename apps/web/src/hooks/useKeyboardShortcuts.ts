import { useEffect } from 'react';
import { useUiStore } from '../store/ui-store.ts';

export function useKeyboardShortcuts() {
  const openPalette = useUiStore((state) => state.openPalette);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openPalette]);
}
