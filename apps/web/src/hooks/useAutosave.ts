import { useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspace-store.ts';

export function useAutosave() {
  const isDirty = useWorkspaceStore((state) => state.isDirty);
  const save = useWorkspaceStore((state) => state.save);
  useEffect(() => {
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      void save().catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isDirty, save]);
}
