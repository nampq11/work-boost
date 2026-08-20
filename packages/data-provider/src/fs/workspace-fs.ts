import { ensureDir } from '@std/fs';
import { basename, dirname, globToRegExp, isAbsolute, join, relative, resolve } from '@std/path';

/**
 * Workspace file system abstraction with safety features
 * Provides atomic writes, path traversal protection, and mutex locking
 */
export interface WorkspaceFS {
  readonly root: string;
  init(): Promise<void>;
  readText(relPath: string): Promise<string>;
  writeTextAtomic(relPath: string, content: string): Promise<void>;
  writeTextIfAbsent(relPath: string, content: string): Promise<boolean>;
  move(fromRelPath: string, toRelPath: string): Promise<void>;
  remove(relPath: string): Promise<void>;
  listFiles(relDir: string): Promise<string[]>;
  listByGlob(globPattern: string): Promise<string[]>;
  exists(relPath: string): Promise<boolean>;
  stat(relPath: string): Promise<{ size: number; modifiedAt: string }>;
  listDirs(relDir: string): Promise<string[]>;
  mkdir(relPath: string): Promise<void>;
}

/**
 * Create a new WorkspaceFS instance
 * @param customRoot Optional custom root path, defaults to ~/.workboost/workspace/
 */
export function createWorkspaceFS(customRoot?: string): WorkspaceFS {
  const rootPath = resolve(
    customRoot ||
      join(Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || '.', '.workboost', 'workspace'),
  );

  const writeLocks = new Map<string, Promise<void>>();

  /**
   * Assert that a path is inside the workspace root (prevents path traversal)
   */
  async function canonicalizePath(path: string): Promise<string> {
    const missingParts: string[] = [];
    let currentPath = path;

    while (true) {
      try {
        const canonicalPath = await Deno.realPath(currentPath);
        return join(canonicalPath, ...missingParts.reverse());
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
        const parentPath = dirname(currentPath);
        if (parentPath === currentPath) throw error;
        missingParts.push(basename(currentPath));
        currentPath = parentPath;
      }
    }
  }

  async function assertInside(relPath: string): Promise<string> {
    const fullPath = resolve(rootPath, relPath);
    const rel = relative(rootPath, fullPath);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('../')) {
      throw new Error(`Access Denied: Path escape detected -> ${relPath}`);
    }

    const [canonicalRoot, canonicalPath] = await Promise.all([
      canonicalizePath(rootPath),
      canonicalizePath(fullPath),
    ]);
    const canonicalRelativePath = relative(canonicalRoot, canonicalPath);
    if (
      isAbsolute(canonicalRelativePath) ||
      canonicalRelativePath === '..' ||
      canonicalRelativePath.startsWith('../')
    ) {
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
      const fullPath = await assertInside(relPath);
      return await Deno.readTextFile(fullPath);
    },

    async writeTextAtomic(relPath: string, content: string): Promise<void> {
      return await withLock(relPath, async () => {
        const fullPath = await assertInside(relPath);
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

    async writeTextIfAbsent(relPath: string, content: string): Promise<boolean> {
      return await withLock(relPath, async () => {
        const fullPath = await assertInside(relPath);
        await ensureDir(dirname(fullPath));
        const file = await Deno.open(fullPath, { createNew: true, write: true });
        try {
          await file.write(new TextEncoder().encode(content));
        } finally {
          file.close();
        }
        return true;
      }).catch((error) => {
        if (error instanceof Deno.errors.AlreadyExists) return false;
        throw error;
      });
    },

    async move(fromRelPath: string, toRelPath: string): Promise<void> {
      const fromFull = await assertInside(fromRelPath);
      const toFull = await assertInside(toRelPath);
      await ensureDir(dirname(toFull));
      await Deno.rename(fromFull, toFull);
    },

    async remove(relPath: string): Promise<void> {
      await Deno.remove(await assertInside(relPath));
    },

    async listFiles(relDir: string): Promise<string[]> {
      const fullDir = await assertInside(relDir);
      const files: string[] = [];
      try {
        for await (const entry of Deno.readDir(fullDir)) {
          if (entry.isFile && /\.(md|json|txt|html)$/i.test(entry.name)) {
            files.push(join(relDir, entry.name));
          }
        }
      } catch {
        return [];
      }
      return files;
    },

    async listByGlob(globPattern: string): Promise<string[]> {
      const pattern = globToRegExp(globPattern, { globstar: true });
      const matches: string[] = [];

      const walk = async (relDir: string) => {
        try {
          for await (const entry of Deno.readDir(join(rootPath, relDir))) {
            const entryRelPath = relDir === '' ? entry.name : join(relDir, entry.name);
            if (entry.isDirectory) {
              // Hidden dirs (.git, .workboost, ...) are internal state, never listable
              if (!entry.name.startsWith('.')) await walk(entryRelPath);
            } else if (entry.isFile && pattern.test(entryRelPath)) {
              matches.push(entryRelPath);
            }
          }
        } catch {
          // Unreadable or missing directories simply contribute no matches
        }
      };

      await walk('');
      return matches.sort();
    },

    async exists(relPath: string): Promise<boolean> {
      try {
        await Deno.stat(await assertInside(relPath));
        return true;
      } catch {
        return false;
      }
    },

    async stat(relPath: string): Promise<{ size: number; modifiedAt: string }> {
      const fullPath = await assertInside(relPath);
      const info = await Deno.stat(fullPath);
      return { size: info.size, modifiedAt: new Date(info.mtime ?? Date.now()).toISOString() };
    },

    async listDirs(relDir: string): Promise<string[]> {
      const fullDir = await assertInside(relDir);
      const dirs: string[] = [];
      try {
        for await (const entry of Deno.readDir(fullDir)) {
          if (entry.isDirectory) {
            dirs.push(entry.name);
          }
        }
      } catch {
        return [];
      }
      return dirs;
    },

    async mkdir(relPath: string): Promise<void> {
      await ensureDir(await assertInside(relPath));
    },
  };
}
