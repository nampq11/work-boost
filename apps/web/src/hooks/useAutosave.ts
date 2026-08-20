import { useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspace-store.ts';

export function useAutosave() {
  const isDirty = useWorkspaceStore((state) => state.isDirty);
  const documentRevision = useWorkspaceStore((state) => state.documentRevision);
  const save = useWorkspaceStore((state) => state.save);
  useEffect(() => {
    if (!isDirty) return;
    let timer: number | undefined;
    let cancelled = false;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void save().catch(() => {
          if (!cancelled) schedule();
        });
      }, 300);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [documentRevision, isDirty, save]);
}
