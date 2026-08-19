import { relative } from '@std/path';
import type { WorkspaceFS } from '../fs/workspace-fs.ts';

/**
 * Change event emitted by the workspace watcher.
 * `paths` are relative to the workspace root.
 */
export interface WorkspaceChangeEvent {
  paths: string[];
  kind: string;
}

export interface WorkspaceWatcher {
  start(): void;
  stop(): void;
}

/**
 * Create a new workspace watcher
 * @param fs Workspace file system instance
 * @param onChange Callback when markdown/json files change
 */
export function createWorkspaceWatcher(
  fs: WorkspaceFS,
  onChange: (event: WorkspaceChangeEvent) => void,
): WorkspaceWatcher {
  let watcher: Deno.FsWatcher | null = null;
  // Retaining the loop promise keeps the async iteration reachable so it is
  // not garbage-collected between ticks (which would silently drop events).
  let _loopPromise: Promise<void> | null = null;

  return {
    start(): void {
      if (watcher) return;

      watcher = Deno.watchFs(fs.root, { recursive: true });

      _loopPromise = (async () => {
        try {
          for await (const event of watcher) {
            if (!['create', 'modify', 'remove', 'rename'].includes(event.kind)) continue;

            const mdPaths = event.paths
              .map((p) => relative(fs.root, p))
              .filter((p) => !p.startsWith('..') && (p.endsWith('.md') || p.endsWith('.json')));
            if (mdPaths.length > 0) {
              onChange({ paths: mdPaths, kind: event.kind });
            }
          }
        } catch (error) {
          // Watching is best-effort; an Interrupted error is expected on close().
          if (!(error instanceof Deno.errors.Interrupted)) {
            console.error('Workspace watcher loop exited with error', error);
          }
        }
      })();

      console.log(`Workspace Watcher started at: ${fs.root}`);
    },

    stop(): void {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
      _loopPromise = null;
    },
  };
}
