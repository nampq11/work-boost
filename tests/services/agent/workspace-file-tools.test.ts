import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import { createListWorkspaceFilesTool, createReadWorkspaceFileTool } from '@work-boost/brain';
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
    listByGlob: () => Promise.resolve([]),
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
  };
}

Deno.test('read_workspace_file reads a markdown file', async () => {
  const fs = createFakeFS({
    'daily/2025-01-15.md': { content: 'Hello world', size: 11 },
  });
  const tool = createReadWorkspaceFileTool(fs);
  const result = await tool.execute('call_1', { path: 'daily/2025-01-15.md' });
  assertEquals(textOf(result).includes('Hello world'), true);
  assertEquals(textOf(result).includes('📄'), true);
});

Deno.test('read_workspace_file reads a JSON file', async () => {
  const fs = createFakeFS({
    'config.json': { content: '{"key":"value"}', size: 14 },
  });
  const tool = createReadWorkspaceFileTool(fs);
  const result = await tool.execute('call_1', { path: 'config.json' });
  assertEquals(textOf(result).includes('{"key":"value"}'), true);
});

Deno.test('read_workspace_file rejects unsupported file types', async () => {
  const fs = createFakeFS({});
  const tool = createReadWorkspaceFileTool(fs);
  await assertRejects(() => tool.execute('call_1', { path: 'script.py' }), Error, 'not supported');
});

Deno.test('read_workspace_file throws when file not found', async () => {
  const fs = createFakeFS({});
  const tool = createReadWorkspaceFileTool(fs);
  await assertRejects(() => tool.execute('call_1', { path: 'missing.md' }), Error, 'not found');
});

Deno.test('read_workspace_file rejects files over 1MB', async () => {
  const fs = createFakeFS({
    'large.md': { content: 'x'.repeat(1000001), size: 1000001 },
  });
  const tool = createReadWorkspaceFileTool(fs);
  await assertRejects(() => tool.execute('call_1', { path: 'large.md' }), Error, 'too large');
});

Deno.test('list_workspace_files lists files in a folder', async () => {
  const fs = createFakeFS({
    'daily/2025-01-15.md': { content: '', size: 0 },
    'daily/2025-01-16.md': { content: '', size: 0 },
  });
  const tool = createListWorkspaceFilesTool(fs);
  const result = await tool.execute('call_1', { folder: 'daily' });
  const data = (result.details as { data: string[] }).data;
  assertEquals(data.length, 2);
});

Deno.test('list_workspace_files shows empty state', async () => {
  const fs = createFakeFS({});
  const tool = createListWorkspaceFilesTool(fs);
  const result = await tool.execute('call_1', { folder: 'daily' });
  assertEquals(textOf(result).includes('trống'), true);
});

Deno.test('list_workspace_files defaults to root', async () => {
  const fs = createFakeFS({
    'root-file.md': { content: '', size: 0 },
  });
  const tool = createListWorkspaceFilesTool(fs);
  const result = await tool.execute('call_1', {});
  const data = (result.details as { data: string[] }).data;
  assertEquals(data.length, 1);
});
