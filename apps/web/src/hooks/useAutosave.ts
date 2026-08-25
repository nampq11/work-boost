import { useEffect } from 'react';
import { ApiError } from '../lib/api-client.ts';
import { useUiStore } from '../store/ui-store.ts';
import { useWorkspaceStore } from '../store/workspace-store.ts';

export function useAutosave() {
  const isDirty = useWorkspaceStore((state) => state.isDirty);
  const documentRevision = useWorkspaceStore((state) => state.documentRevision);
  const save = useWorkspaceStore((state) => state.save);
  const isAutosaveEnabled = useUiStore((state) => state.isAutosaveEnabled);
  useEffect(() => {
    if (!isAutosaveEnabled) return;
    if (!isDirty) return;
    let timer: number | undefined;
    let cancelled = false;
    let retryDelay = 300;
    const schedule = (delay: number) => {
      timer = globalThis.setTimeout(() => {
        void save().catch((error) => {
          if (cancelled || (error instanceof ApiError && error.code === 'CONFLICT')) return;
          retryDelay = Math.min(retryDelay * 2, 5000);
          schedule(retryDelay);
        });
      }, delay);
    };
    schedule(300);
    return () => {
      cancelled = true;
      if (timer !== undefined) globalThis.clearTimeout(timer);
    };
  }, [documentRevision, isDirty, isAutosaveEnabled, save]);
}
