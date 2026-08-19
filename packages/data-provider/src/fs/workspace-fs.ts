import { ensureDir } from '@std/fs';
import { dirname, join, relative, resolve } from '@std/path';

/**
 * Workspace file system abstraction with safety features
 * Provides atomic writes, path traversal protection, and mutex locking
 */
export interface WorkspaceFS {
  readonly root: string;
  init(): Promise<void>;
  readText(relPath: string): Promise<string>;
  writeTextAtomic(relPath: string, content: string): Promise<void>;
  move(fromRelPath: string, toRelPath: string): Promise<void>;
  remove(relPath: string): Promise<void>;
  listFiles(relDir: string): Promise<string[]>;
  exists(relPath: string): Promise<boolean>;
}

/**
 * Create a new WorkspaceFS instance
 * @param customRoot Optional custom root path, defaults to ~/.workboost/workspace/
 */
export function createWorkspaceFS(customRoot?: string): WorkspaceFS {
  const rootPath = resolve(
    customRoot || join(
      Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || '.',
      '.workboost',
      'workspace',
    ),
  );

  const writeLocks = new Map<string, Promise<void>>();

  /**
   * Assert that a path is inside the workspace root (prevents path traversal)
   */
  function assertInside(relPath: string): string {
    const fullPath = resolve(rootPath, relPath);
    const rel = relative(rootPath, fullPath);
    if (rel.startsWith('..') || resolve(fullPath) !== fullPath) {
      throw new Error(`Access Denied: Path escape detected -> ${relPath}`);
    }
    return fullPath;
  }

  /**
   * Mutex lock implementation to prevent race conditions
   */
  async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    while (writeLocks.has(key)) {
      await writeLocks.get(key);
    }

    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((r) => (resolveLock = r));
    writeLocks.set(key, lockPromise);

    try {
      return await task();
    } finally {
      writeLocks.delete(key);
      resolveLock();
    }
  }

  return {
    get root() {
      return rootPath;
    },

    async init(): Promise<void> {
      await ensureDir(rootPath);
      await ensureDir(join(rootPath, '.workboost'));
      await ensureDir(join(rootPath, 'daily'));
      await ensureDir(join(rootPath, 'debts'));
      await ensureDir(join(rootPath, 'debts', 'archive'));
    },

    async readText(relPath: string): Promise<string> {
      const fullPath = assertInside(relPath);
      return await Deno.readTextFile(fullPath);
    },

    async writeTextAtomic(relPath: string, content: string): Promise<void> {
      return await withLock(relPath, async () => {
        const fullPath = assertInside(relPath);
        await ensureDir(dirname(fullPath));

        const tempPath = `${fullPath}.${crypto.randomUUID()}.tmp`;
        const bytes = new TextEncoder().encode(content);
        await Deno.writeFile(tempPath, bytes);

        try {
          await Deno.rename(tempPath, fullPath);
        } catch {
          // Fallback for Windows if file is locked by OS
          await Deno.copyFile(tempPath, fullPath);
          await Deno.remove(tempPath);
        }
      });
    },

    async move(fromRelPath: string, toRelPath: string): Promise<void> {
      const fromFull = assertInside(fromRelPath);
      const toFull = assertInside(toRelPath);
      await ensureDir(dirname(toFull));
      await Deno.rename(fromFull, toFull);
    },

    async remove(relPath: string): Promise<void> {
      await Deno.remove(assertInside(relPath));
    },

    async listFiles(relDir: string): Promise<string[]> {
      const fullDir = assertInside(relDir);
      const files: string[] = [];
      try {
        for await (const entry of Deno.readDir(fullDir)) {
          if (entry.isFile && entry.name.endsWith('.md')) {
            files.push(join(relDir, entry.name));
          }
        }
      } catch {
        return [];
      }
      return files;
    },

    async exists(relPath: string): Promise<boolean> {
      try {
        await Deno.stat(assertInside(relPath));
        return true;
      } catch {
        return false;
      }
    },
  };
}
