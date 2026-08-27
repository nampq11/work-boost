/// <reference lib="deno.ns" />

import { ensureDir, exists } from '@std/fs';
import { basename, dirname, globToRegExp, isAbsolute, join, relative, resolve } from '@std/path';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { hasAllowedExtension } from '@work-boost/shared/workspace-path.ts';

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
  conditionalUpdate(
    relPath: string,
    expectedModifiedAt: string | undefined,
    transform: (current: WorkspaceFileState) => Promise<string | null> | string | null,
  ): Promise<ConditionalUpdateResult>;
}

export interface WorkspaceFileState {
  content: string | null;
  modifiedAt: string | null;
}

export type ConditionalUpdateResult =
  | { status: 'updated'; content: string; modifiedAt: string }
  | { status: 'not-found' }
  | { status: 'conflict'; modifiedAt: string };

/**
 * Older workspaces stored archived debts under debts/archive/. The archive is
 * now workspace-wide (archive/ at the root), so relocate any legacy content on
 * startup. Name collisions are skipped and the legacy folder is only removed
 * when it ends up empty.
 */
async function migrateLegacyDebtArchive(rootPath: string): Promise<void> {
  const legacyDir = join(rootPath, 'debts', 'archive');
  const targetDir = join(rootPath, 'archive');
  try {
    await ensureDir(targetDir);
    for await (const entry of Deno.readDir(legacyDir)) {
      const from = join(legacyDir, entry.name);
      const to = join(targetDir, entry.name);
      if (await exists(to)) {
        logger.warn('Legacy archive entry conflicts with existing file, skipped', {
          from,
          to,
        });
        continue;
      }
      await Deno.rename(from, to);
    }
    // Fails when collisions kept the legacy dir non-empty; that is fine.
    await Deno.remove(legacyDir).catch(() => undefined);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
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

  async function writeTextAtomicUnlocked(fullPath: string, content: string): Promise<void> {
    await ensureDir(dirname(fullPath));
    const tempPath = `${fullPath}.${crypto.randomUUID()}.tmp`;
    const bytes = new TextEncoder().encode(content);
    await Deno.writeFile(tempPath, bytes);

    try {
      await Deno.rename(tempPath, fullPath);
    } catch {
      // Fallback for Windows if file is locked by OS
      try {
        await Deno.copyFile(tempPath, fullPath);
      } finally {
        await Deno.remove(tempPath).catch(() => undefined);
      }
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
      await ensureDir(join(rootPath, 'archive'));
      await migrateLegacyDebtArchive(rootPath);
    },

    async readText(relPath: string): Promise<string> {
      const fullPath = await assertInside(relPath);
      return await Deno.readTextFile(fullPath);
    },

    async writeTextAtomic(relPath: string, content: string): Promise<void> {
      return await withLock(relPath, async () => {
        const fullPath = await assertInside(relPath);
        await writeTextAtomicUnlocked(fullPath, content);
      });
    },

    async conditionalUpdate(
      relPath: string,
      expectedModifiedAt: string | undefined,
      transform: (current: WorkspaceFileState) => Promise<string | null> | string | null,
    ): Promise<ConditionalUpdateResult> {
      return await withLock(relPath, async () => {
        const fullPath = await assertInside(relPath);
        let current: WorkspaceFileState = { content: null, modifiedAt: null };
        try {
          const [content, info] = await Promise.all([
            Deno.readTextFile(fullPath),
            Deno.stat(fullPath),
          ]);
          current = {
            content,
            modifiedAt: new Date(info.mtime ?? Date.now()).toISOString(),
          };
        } catch (error) {
          if (!(error instanceof Deno.errors.NotFound)) throw error;
        }

        if (expectedModifiedAt !== undefined) {
          if (current.modifiedAt === null) return { status: 'not-found' };
          if (current.modifiedAt !== expectedModifiedAt) {
            return { status: 'conflict', modifiedAt: current.modifiedAt };
          }
        }

        const content = await transform(current);
        if (content === null) return { status: 'not-found' };
        await writeTextAtomicUnlocked(fullPath, content);
        if (current.modifiedAt !== null) {
          const nextModifiedAt = new Date(Math.max(Date.now(), Date.parse(current.modifiedAt) + 1));
          await Deno.utime(fullPath, nextModifiedAt, nextModifiedAt);
        }
        const info = await Deno.stat(fullPath);
        return {
          status: 'updated',
          content,
          modifiedAt: new Date(info.mtime ?? Date.now()).toISOString(),
        };
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
      try {
        const files: string[] = [];
        for await (const entry of Deno.readDir(fullDir)) {
          if (entry.isFile && hasAllowedExtension(entry.name)) {
            files.push(join(relDir, entry.name));
          }
        }
        return files;
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new Error(`Folder not found: ${relDir}`);
        }
        throw error;
      }
    },

    async listByGlob(globPattern: string): Promise<string[]> {
      const pattern = globToRegExp(globPattern, { globstar: true });
      const matches: string[] = [];

      const walk = async (relDir: string, isRoot: boolean) => {
        try {
          for await (const entry of Deno.readDir(join(rootPath, relDir))) {
            const entryRelPath = relDir === '' ? entry.name : join(relDir, entry.name);
            if (entry.isDirectory) {
              // Hidden dirs (.git, .workboost, ...) are internal state, never listable
              if (!entry.name.startsWith('.')) await walk(entryRelPath, false);
            } else if (entry.isFile && pattern.test(entryRelPath)) {
              matches.push(entryRelPath);
            }
          }
        } catch (error) {
          // Missing/unreadable subdirectories contribute no matches, but a
          // missing workspace root is a real failure, not an empty result.
          if (isRoot) {
            if (error instanceof Deno.errors.NotFound) {
              throw new Error(`Workspace root not found: ${rootPath}`);
            }
            throw error;
          }
        }
      };

      await walk('', true);
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
      try {
        const dirs: string[] = [];
        for await (const entry of Deno.readDir(fullDir)) {
          if (entry.isDirectory) {
            dirs.push(entry.name);
          }
        }
        return dirs;
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new Error(`Folder not found: ${relDir}`);
        }
        throw error;
      }
    },

    async mkdir(relPath: string): Promise<void> {
      await ensureDir(await assertInside(relPath));
    },
  };
}
