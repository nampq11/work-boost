import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import { createWorkspaceTool } from '@work-boost/brain';
import type { WorkspaceFS } from '@work-boost/data-provider';

function textOf(result: AgentToolResult<unknown>): string {
  const textBlock = result.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

function createFakeFS(files: Record<string, { content: string; size: number }> = {}): WorkspaceFS {
  return {
    root: '/tmp/fake',
    init: () => Promise.resolve(),
    readText: (path) => {
      if (!(path in files)) throw new Error(`File not found: ${path}`);
      return Promise.resolve(files[path].content);
    },
    writeTextAtomic: () => Promise.resolve(),
    writeTextIfAbsent: () => Promise.resolve(true),
    move: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    listByGlob: (pattern) => {
      const scoped = pattern.startsWith('**') ? '' : pattern.split('/**')[0];
      const matches = Object.keys(files).filter(
        (p) => p.endsWith('.md') && (!scoped || p.startsWith(scoped)),
      );
      return Promise.resolve(matches);
    },
    listFiles: (dir) => {
      const matching = Object.keys(files).filter((p) => p.startsWith(dir));
      return Promise.resolve(matching);
    },
    exists: (path) => Promise.resolve(path in files),
    stat: (path) => {
      if (!(path in files)) throw new Error(`File not found: ${path}`);
      return Promise.resolve({ size: files[path].size, modifiedAt: '' });
    },
    listDirs: () => Promise.resolve([]),
    mkdir: () => Promise.resolve(),
    conditionalUpdate: () => Promise.resolve({ status: 'not-found' as const }),
  };
}

Deno.test('workspace read reads a markdown file', async () => {
  const fs = createFakeFS({
    'daily/2025-01-15.md': { content: 'Hello world', size: 11 },
  });
  const tool = createWorkspaceTool(fs);
  const result = await tool.execute('call_1', { action: 'read', path: 'daily/2025-01-15.md' });
  assertEquals(textOf(result).includes('Hello world'), true);
  assertEquals(textOf(result).includes('📄'), true);
});

Deno.test('workspace read reads a JSON file', async () => {
  const fs = createFakeFS({
    'config.json': { content: '{"key":"value"}', size: 14 },
  });
  const tool = createWorkspaceTool(fs);
  const result = await tool.execute('call_1', { action: 'read', path: 'config.json' });
  assertEquals(textOf(result).includes('{"key":"value"}'), true);
});

Deno.test('workspace read rejects unsupported file types', async () => {
  const fs = createFakeFS({});
  const tool = createWorkspaceTool(fs);
  await assertRejects(
    () => tool.execute('call_1', { action: 'read', path: 'script.py' }),
    Error,
    'not supported',
  );
});

Deno.test('workspace read throws when file not found', async () => {
  const fs = createFakeFS({});
  const tool = createWorkspaceTool(fs);
  await assertRejects(
    () => tool.execute('call_1', { action: 'read', path: 'missing.md' }),
    Error,
    'not found',
  );
});

Deno.test('workspace read rejects files over 1MB', async () => {
  const fs = createFakeFS({
    'large.md': { content: 'x'.repeat(1000001), size: 1000001 },
  });
  const tool = createWorkspaceTool(fs);
  await assertRejects(
    () => tool.execute('call_1', { action: 'read', path: 'large.md' }),
    Error,
    'too large',
  );
});

Deno.test('workspace read throws when path is missing', async () => {
  const fs = createFakeFS({});
  const tool = createWorkspaceTool(fs);
  await assertRejects(() => tool.execute('call_1', { action: 'read' }), Error);
});

Deno.test('workspace list lists files in a folder', async () => {
  const fs = createFakeFS({
    'daily/2025-01-15.md': { content: '', size: 0 },
    'daily/2025-01-16.md': { content: '', size: 0 },
  });
  const tool = createWorkspaceTool(fs);
  const result = await tool.execute('call_1', { action: 'list', folder: 'daily' });
  const data = (result.details as { data: string[] }).data;
  assertEquals(data.length, 2);
});

Deno.test('workspace list shows empty state', async () => {
  const fs = createFakeFS({});
  const tool = createWorkspaceTool(fs);
  const result = await tool.execute('call_1', { action: 'list', folder: 'daily' });
  assertEquals(textOf(result).includes('trống'), true);
});

Deno.test('workspace list defaults to root', async () => {
  const fs = createFakeFS({
    'root-file.md': { content: '', size: 0 },
  });
  const tool = createWorkspaceTool(fs);
  const result = await tool.execute('call_1', { action: 'list' });
  const data = (result.details as { data: string[] }).data;
  assertEquals(data.length, 1);
});

Deno.test('workspace search finds matching lines', async () => {
  const fs = createFakeFS({
    'notes/idea.md': { content: '# Idea\nBuild the debt tracker\nAnother line', size: 45 },
    'daily/2025-01-15.md': { content: 'Worked on debt tracker UI', size: 30 },
  });
  const tool = createWorkspaceTool(fs);
  const result = await tool.execute('call_1', { action: 'search', query: 'debt tracker' });
  assertEquals(textOf(result).includes('2 kết quả'), true);
  assertEquals(textOf(result).includes('notes/idea.md:2'), true);
  assertEquals(textOf(result).includes('daily/2025-01-15.md:1'), true);
});

Deno.test('workspace search shows empty state when no match', async () => {
  const fs = createFakeFS({
    'notes/idea.md': { content: '# Idea\nNo keyword here', size: 30 },
  });
  const tool = createWorkspaceTool(fs);
  const result = await tool.execute('call_1', { action: 'search', query: 'zzz-not-found' });
  assertEquals(textOf(result).includes('Không tìm thấy'), true);
});

Deno.test('workspace search throws when query is missing', async () => {
  const fs = createFakeFS({});
  const tool = createWorkspaceTool(fs);
  await assertRejects(() => tool.execute('call_1', { action: 'search' }), Error);
});
