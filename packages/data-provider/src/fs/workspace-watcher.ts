/// <reference lib="deno.ns" />

import { relative } from '@std/path';
import type { WorkspaceFS } from '../fs/workspace-fs.ts';
import { logger } from '@work-boost/shared';

/**
 * Change event emitted by the workspace watcher.
 * `paths` are relative to the workspace root.
 */
export interface WorkspaceChangeEvent {
  paths: string[];
  kind: string;
}

function isCancellationError(error: unknown): boolean {
  return (
    error instanceof Deno.errors.Interrupted ||
    (error instanceof Error &&
      (error.name === 'AbortError' ||
        /operation canceled|request has been cancelled/i.test(error.message)))
  );
}

export interface WorkspaceWatcher {
  start(): void;
  stop(): void;
}

/**
 * Create a new workspace watcher
 * @param fs Workspace file system instance
 * @param onChange Callback when workspace files change
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

            const workspacePaths = event.paths
              .map((p) => relative(fs.root, p))
              .filter(
                (p) =>
                  !p.startsWith('..') && !p.split(/[\\/]+/).some((part) => part.startsWith('.')),
              );
            if (workspacePaths.length > 0) {
              onChange({ paths: workspacePaths, kind: event.kind });
            }
          }
        } catch (error) {
          // Watching is best-effort; an Interrupted error is expected on close().
          if (!isCancellationError(error)) {
            logger.error('Workspace watcher loop exited with error', { error });
          }
        }
      })();

      logger.info(`Workspace Watcher started at: ${fs.root}`);
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
