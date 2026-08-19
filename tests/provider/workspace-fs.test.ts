import { assertEquals, assertThrows } from '@std/assert';
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
    assertEquals(await checkDir('debts/archive'), true);
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
    let writeCount = 0;

    // Launch multiple concurrent writes
    const writes = Array.from({ length: 5 }, (_, i) =>
      fs.writeTextAtomic(testPath, `Content ${i}`),
    );

    // All writes should complete without conflict
    await Promise.all(writes);
    writeCount++;

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
