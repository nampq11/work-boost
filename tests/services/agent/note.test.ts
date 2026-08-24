import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import { createNoteTool } from '@work-boost/brain';
import type { WorkspaceFS } from '@work-boost/data-provider';

function textOf(result: AgentToolResult<unknown>): string {
  const textBlock = result.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

interface Capture {
  path: string;
  content: string;
}

function createRecordingFS(isExisting?: (path: string, attemptCount: number) => boolean): {
  fs: WorkspaceFS;
  attempts: Capture[];
  writes: Capture[];
  overwrites: Capture[];
} {
  const attempts: Capture[] = [];
  const writes: Capture[] = [];
  const overwrites: Capture[] = [];
  const attemptsByPath = new Map<string, number>();
  const fs: WorkspaceFS = {
    root: '/tmp/fake',
    init: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
    writeTextAtomic: (path, content) => {
      overwrites.push({ path, content });
      return Promise.resolve();
    },
    writeTextIfAbsent: (path, content) => {
      attempts.push({ path, content });
      const attemptCount = (attemptsByPath.get(path) ?? 0) + 1;
      attemptsByPath.set(path, attemptCount);
      if (isExisting?.(path, attemptCount)) return Promise.resolve(false);
      writes.push({ path, content });
      return Promise.resolve(true);
    },
    move: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    listByGlob: () => Promise.resolve([]),
    listFiles: () => Promise.resolve([]),
    exists: () => Promise.resolve(true),
    stat: () => Promise.resolve({ size: 0, modifiedAt: '' }),
    listDirs: () => Promise.resolve([]),
    mkdir: () => Promise.resolve(),
    conditionalUpdate: () => Promise.resolve({ status: 'not-found' as const }),
  };
  return { fs, attempts, writes, overwrites };
}

Deno.test('create_note writes to a notes/*.md path', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createNoteTool(fs);
  const result = await tool.execute('call_1', { content: 'Hello' });

  assertEquals(writes.length, 1);
  assertEquals(writes[0].path.startsWith('notes/'), true);
  assertEquals(writes[0].path.endsWith('.md'), true);
  assertEquals(textOf(result).includes('notes/'), true);
  assertEquals(textOf(result).includes('📝'), true);
});

Deno.test('create_note writes a heading when a title is given', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createNoteTool(fs);
  await tool.execute('call_1', { content: 'Body', title: 'My Note' });

  assertEquals(writes[0].content.startsWith('# My Note'), true);
  assertEquals(writes[0].content.includes('Body'), true);
});

Deno.test('create_note writes raw content when no title is given', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createNoteTool(fs);
  await tool.execute('call_1', { content: 'Just content' });

  assertEquals(writes[0].content, 'Just content');
});

Deno.test('create_note rejects empty or whitespace-only content', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createNoteTool(fs);

  await assertRejects(() => tool.execute('call_1', { content: '' }), Error);
  assertEquals(writes.length, 0);

  await assertRejects(() => tool.execute('call_1', { content: '   \n\t' }), Error);
  assertEquals(writes.length, 0);
});

Deno.test('create_note slugs the title into a safe dashed path', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createNoteTool(fs);
  await tool.execute('call_1', { content: 'Body', title: 'Ghi chú Tháng 12!' });

  const match = writes[0].path.match(/^notes\/([a-z0-9-]+)-\d{8}-\d{6}\.md$/);
  assertEquals(match !== null, true);
  assertEquals(match![1], 'ghi-chu-thang-12');
});

Deno.test('create_note falls back to "note" for a title that slugs to empty', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createNoteTool(fs);
  await tool.execute('call_1', { content: 'Body', title: '!!!' });

  const match = writes[0].path.match(/^notes\/([a-z0-9-]+)-\d{8}-\d{6}\.md$/);
  assertEquals(match![1], 'note');
});

Deno.test('create_note never overwrites an existing file', async () => {
  const { fs, writes, overwrites } = createRecordingFS();
  const tool = createNoteTool(fs);
  await tool.execute('call_1', { content: 'Hello' });

  assertEquals(writes.length, 1);
  assertEquals(overwrites.length, 0);
});

Deno.test('create_note retries with a counter suffix when the path is taken', async () => {
  // Treat the first attempted path as already existing to force a collision.
  let occupiedPath: string | null = null;
  const { fs, attempts, writes } = createRecordingFS((path) => {
    occupiedPath ??= path;
    return path === occupiedPath;
  });
  const tool = createNoteTool(fs);
  const result = await tool.execute('call_1', { content: 'Hello', title: 'Idea' });

  assertEquals(attempts.length, 2);
  const [baseAttempt, retryAttempt] = attempts;
  assertEquals(retryAttempt.path, baseAttempt.path.replace(/\.md$/, '-1.md'));
  assertEquals(
    attempts.every((attempt) => attempt.content === '# Idea\n\nHello'),
    true,
  );
  assertEquals(writes.length, 1);
  assertEquals(writes[0].path, retryAttempt.path);
  assertEquals(textOf(result).includes(retryAttempt.path), true);
});

Deno.test('create_note gives up after repeated collisions without writing', async () => {
  const { fs, attempts, writes } = createRecordingFS(() => true);
  const tool = createNoteTool(fs);

  await assertRejects(() => tool.execute('call_1', { content: 'Hello' }), Error);
  assertEquals(attempts.length > 1, true);
  assertEquals(writes.length, 0);
});
