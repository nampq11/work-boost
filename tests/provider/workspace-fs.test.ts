import { assertEquals, assertRejects } from '@std/assert';
import { join } from '@std/path';
import { createWorkspaceFS } from '@work-boost/data-provider/fs/workspace-fs.ts';

// Helper to create a temp directory for testing
async function withTempDir(fn: (dir: string) => Promise<void>) {
  const tempDir = join(Deno.env.get('TEMP') || '/tmp', `workspace-fs-test-${crypto.randomUUID()}`);
  await Deno.mkdir(tempDir, { recursive: true });
  try {
    await fn(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

Deno.test('WorkspaceFS - should initialize workspace directories', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);
    await fs.init();

    // Verify directories exist
    const checkDir = async (path: string) => {
      try {
        const stat = await Deno.stat(join(root, path));
        return stat.isDirectory;
      } catch {
        return false;
      }
    };

    assertEquals(await checkDir('.workboost'), true);
    assertEquals(await checkDir('daily'), true);
    assertEquals(await checkDir('debts'), true);
  });
});

Deno.test('WorkspaceFS - should migrate legacy debts/archive to top-level archive', async () => {
  await withTempDir(async (root) => {
    await Deno.mkdir(join(root, 'debts', 'archive'), { recursive: true });
    await Deno.writeTextFile(join(root, 'debts', 'archive', 'old-debt.md'), 'legacy');
    await Deno.mkdir(join(root, 'archive'), { recursive: true });
    await Deno.writeTextFile(join(root, 'archive', 'existing.md'), 'existing');

    const fs = createWorkspaceFS(root);
    await fs.init();

    assertEquals(await fs.exists('archive/old-debt.md'), true);
    assertEquals(await fs.exists('archive/existing.md'), true);
    // The colliding legacy folder is kept so no data is ever lost.
    assertEquals(await fs.exists('debts/archive/old-debt.md'), false);
  });
});

Deno.test('WorkspaceFS - should prevent path traversal attacks', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);

    // Try various path traversal attempts
    const traversalAttempts = [
      '../../../etc/passwd',
      '../../etc/passwd',
      '../outside',
      '/etc/passwd',
    ];

    for (const attempt of traversalAttempts) {
      try {
        await fs.readText(attempt);
        throw new Error(`Should have blocked path traversal: ${attempt}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Access Denied')) {
          // Expected behavior
        } else {
          throw error;
        }
      }
    }
  });
});

Deno.test('WorkspaceFS - perform atomic writes', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);
    await fs.init();

    const testPath = 'test.md';
    const testContent = 'Test content';

    // Write file atomically
    await fs.writeTextAtomic(testPath, testContent);
    assertEquals(await fs.writeTextIfAbsent(testPath, 'replacement'), false);
    assertEquals(await fs.readText(testPath), testContent);
    assertEquals(await fs.writeTextIfAbsent('new.md', 'created'), true);
    assertEquals(await fs.readText('new.md'), 'created');

    // Verify content was written correctly
    const readContent = await fs.readText(testPath);
    assertEquals(readContent, testContent);

    // Verify no temporary files were left behind
    const files = await fs.listFiles('.');
    assertEquals(
      files.some((f) => f.includes('.tmp')),
      false,
    );
  });
});

Deno.test('WorkspaceFS - mutex lock prevents race conditions', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);
    await fs.init();

    const testPath = 'race-test.md';

    // Launch multiple concurrent writes
    const writes = Array.from({ length: 5 }, (_, i) =>
      fs.writeTextAtomic(testPath, `Content ${i}`),
    );

    // All writes should complete without conflict
    await Promise.all(writes);

    // Verify final state is consistent
    const content = await fs.readText(testPath);
    // Content should be one of the written versions
    const isValidContent = content.startsWith('Content ');
    assertEquals(isValidContent, true);
  });
});

Deno.test('WorkspaceFS - file operations work correctly', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);
    await fs.init();

    // Test write and read
    await fs.writeTextAtomic('test.md', 'Hello World');
    assertEquals(await fs.exists('test.md'), true);
    assertEquals(await fs.readText('test.md'), 'Hello World');

    // Test move
    await fs.move('test.md', 'moved.md');
    assertEquals(await fs.exists('test.md'), false);
    assertEquals(await fs.exists('moved.md'), true);
    assertEquals(await fs.readText('moved.md'), 'Hello World');

    // Test list files
    await fs.writeTextAtomic('daily/file1.md', 'content1');
    await fs.writeTextAtomic('daily/file2.md', 'content2');
    const files = await fs.listFiles('daily');
    assertEquals(files.length, 2);
    assertEquals(
      files.every((f) => f.endsWith('.md')),
      true,
    );
  });
});

Deno.test('WorkspaceFS - conditional updates reject stale writers atomically', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);
    await fs.init();
    await fs.writeTextAtomic('conditional.md', 'initial');
    const version = (await fs.stat('conditional.md')).modifiedAt;

    const results = await Promise.all([
      fs.conditionalUpdate('conditional.md', version, () => 'first'),
      fs.conditionalUpdate('conditional.md', version, () => 'second'),
    ]);

    assertEquals(results.filter((result) => result.status === 'updated').length, 1);
    assertEquals(results.filter((result) => result.status === 'conflict').length, 1);
    assertEquals(['first', 'second'].includes(await fs.readText('conditional.md')), true);
  });
});

Deno.test('WorkspaceFS - listFiles reports a missing folder, not an empty one', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);
    await fs.init();

    // notes/ is created on demand by the note tool, so it may legitimately not
    // exist yet. Listing it must surface that as not-found, never as "empty".
    await assertRejects(() => fs.listFiles('notes'), Error, 'Folder not found: notes');
  });
});

Deno.test('WorkspaceFS - listDirs reports a missing folder, not an empty one', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);
    await fs.init();

    await assertRejects(() => fs.listDirs('notes'), Error, 'Folder not found: notes');
  });
});

Deno.test('WorkspaceFS - listFiles returns [] for an existing but empty folder', async () => {
  await withTempDir(async (root) => {
    const fs = createWorkspaceFS(root);
    await fs.init();
    await fs.mkdir('notes');

    const files = await fs.listFiles('notes');
    assertEquals(files, []);
  });
});
