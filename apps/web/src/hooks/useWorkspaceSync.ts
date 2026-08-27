import { useEffect } from 'react';
import { useDataPort } from '../contexts/DataPortContext.tsx';
import { useWorkspaceStore } from '../store/workspace-store.ts';

export function useWorkspaceSync() {
  const port = useDataPort();
  const loadFiles = useWorkspaceStore((state) => state.loadFiles);
  const handleEvent = useWorkspaceStore((state) => state.handleEvent);
  useEffect(() => {
    void loadFiles();
    const unsubscribe = port.subscribe(
      (event) => {
        void handleEvent(event);
      },
      () => {
        /* EventSource retries using the server retry value. */
      },
    );
    return unsubscribe;
  }, [loadFiles, handleEvent, port]);
}
