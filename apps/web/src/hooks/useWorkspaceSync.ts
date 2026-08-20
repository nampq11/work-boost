import { useEffect } from 'react';
import { api } from '../lib/api-client.ts';
import { useWorkspaceStore } from '../store/workspace-store.ts';

export function useWorkspaceSync() {
  const loadFiles = useWorkspaceStore((state) => state.loadFiles);
  const handleEvent = useWorkspaceStore((state) => state.handleEvent);
  useEffect(() => {
    void loadFiles();
    const unsubscribe = api.subscribe(
      (event) => {
        void handleEvent(event);
      },
      () => {
        /* EventSource retries using the server retry value. */
      },
    );
    return unsubscribe;
  }, [loadFiles, handleEvent]);
}
