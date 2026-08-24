import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import { createCreateNoteTool } from '@work-boost/brain';
import type { WorkspaceFS } from '@work-boost/data-provider';

function textOf(result: AgentToolResult<unknown>): string {
  const textBlock = result.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

interface Capture {
  path: string;
  content: string;
}

function createRecordingFS(): { fs: WorkspaceFS; writes: Capture[] } {
  const writes: Capture[] = [];
  const fs: WorkspaceFS = {
    root: '/tmp/fake',
    init: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
    writeTextAtomic: (path, content) => {
      writes.push({ path, content });
      return Promise.resolve();
    },
    writeTextIfAbsent: () => Promise.resolve(true),
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
  return { fs, writes };
}

Deno.test('create_note writes to a notes/*.md path', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createCreateNoteTool(fs);
  const result = await tool.execute('call_1', { content: 'Hello' });

  assertEquals(writes.length, 1);
  assertEquals(writes[0].path.startsWith('notes/'), true);
  assertEquals(writes[0].path.endsWith('.md'), true);
  assertEquals(textOf(result).includes('notes/'), true);
  assertEquals(textOf(result).includes('📝'), true);
});

Deno.test('create_note writes a heading when a title is given', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createCreateNoteTool(fs);
  await tool.execute('call_1', { content: 'Body', title: 'My Note' });

  assertEquals(writes[0].content.startsWith('# My Note'), true);
  assertEquals(writes[0].content.includes('Body'), true);
});

Deno.test('create_note writes raw content when no title is given', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createCreateNoteTool(fs);
  await tool.execute('call_1', { content: 'Just content' });

  assertEquals(writes[0].content, 'Just content');
});

Deno.test('create_note rejects empty or whitespace-only content', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createCreateNoteTool(fs);

  await assertRejects(() => tool.execute('call_1', { content: '' }), Error);
  assertEquals(writes.length, 0);

  await assertRejects(() => tool.execute('call_1', { content: '   \n\t' }), Error);
  assertEquals(writes.length, 0);
});

Deno.test('create_note slugs the title into a safe dashed path', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createCreateNoteTool(fs);
  await tool.execute('call_1', { content: 'Body', title: 'Ghi chú Tháng 12!' });

  const match = writes[0].path.match(/^notes\/([a-z0-9-]+)-\d{8}-\d{6}\.md$/);
  assertEquals(match !== null, true);
  assertEquals(match![1], 'ghi-chu-thang-12');
});

Deno.test('create_note falls back to "note" for a title that slugs to empty', async () => {
  const { fs, writes } = createRecordingFS();
  const tool = createCreateNoteTool(fs);
  await tool.execute('call_1', { content: 'Body', title: '!!!' });

  const match = writes[0].path.match(/^notes\/([a-z0-9-]+)-\d{8}-\d{6}\.md$/);
  assertEquals(match![1], 'note');
});
