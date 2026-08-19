import type { WorkspaceFS } from '../fs/workspace-fs.ts';

/**
 * Workspace file watcher for development/debugging
 * Monitors file changes in the workspace directory
 */
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
  onChange: (paths: string[]) => void,
): WorkspaceWatcher {
  let watcher: Deno.FsWatcher | null = null;

  return {
    start(): void {
      if (watcher) return;

      try {
        const currentWatcher = Deno.watchFs(fs.root, { recursive: true });
        watcher = currentWatcher;
        (async () => {
          for await (const event of currentWatcher) {
            if (['create', 'modify', 'remove'].includes(event.kind)) {
              const mdPaths = event.paths.filter((p) => p.endsWith('.md') || p.endsWith('.json'));
              if (mdPaths.length > 0) {
                onChange(mdPaths);
              }
            }
          }
        })();
        console.log(`Workspace Watcher started at: ${fs.root}`);
      } catch (err) {
        console.error('Failed to start Workspace Watcher', { error: err });
      }
    },

    stop(): void {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
}
