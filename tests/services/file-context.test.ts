import { assert, assertEquals } from '@std/assert';
import type { WorkspaceFS } from '@work-boost/data-provider';
import {
  buildReferencedFileBlock,
  parseFileReferences,
} from '../../apps/api/src/services/file-context.ts';

function fakeFs(
  files: Record<string, string>,
  failPaths: string[] = [],
  extraDirs: string[] = [],
): WorkspaceFS {
  // Derive the directory tree from file paths so listDirs/listFiles behave
  // like the real WorkspaceFS for direct children of any mentioned folder.
  const dirSet = new Set(extraDirs);
  for (const path of Object.keys(files)) {
    const parts = path.split('/');
    parts.pop();
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      dirSet.add(current);
    }
  }
  const childEntries = (dir: string): string[] => {
    const prefix = dir ? `${dir}/` : '';
    const names = new Set<string>();
    for (const path of Object.keys(files)) {
      if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split('/')[0]);
    }
    for (const dirPath of dirSet) {
      if (dirPath.startsWith(prefix)) names.add(dirPath.slice(prefix.length).split('/')[0]);
    }
    return [...names];
  };
  const isDirectChild = (path: string, dir: string): boolean => {
    const prefix = dir ? `${dir}/` : '';
    return path.startsWith(prefix) && !path.slice(prefix.length).includes('/');
  };
  return {
    exists: (path) => Promise.resolve(path in files || failPaths.includes(path)),
    readText: (path) =>
      failPaths.includes(path)
        ? Promise.reject(new Error(`read failed for ${path}`))
        : Promise.resolve(files[path] ?? ''),
    listDirs: (dir) =>
      Promise.resolve(
        childEntries(dir).filter((name) => dirSet.has(dir ? `${dir}/${name}` : name)),
      ),
    listFiles: (dir) =>
      Promise.resolve(Object.keys(files).filter((path) => isDirectChild(path, dir))),
  } as unknown as WorkspaceFS;
}

Deno.test('parseFileReferences finds unique md/json/txt refs in order', () => {
  const message = 'See @daily/2025-01-15.md and @notes/a.json, then @daily/2025-01-15.md again';
  assertEquals(parseFileReferences(message), ['daily/2025-01-15.md', 'notes/a.json']);
});

Deno.test('parseFileReferences ignores non-file @words and unsupported extensions', () => {
  const message = 'Ping @john about @docs/report.pdf and a plain email-like user@host';
  assertEquals(parseFileReferences(message), []);
});

Deno.test('parseFileReferences returns empty array when no refs', () => {
  assertEquals(parseFileReferences('no mentions here'), []);
});

Deno.test('buildReferencedFileBlock returns the original message when no refs', async () => {
  const fs = fakeFs({ 'a.md': 'hello' });
  const message = 'no mentions here';
  assertEquals(await buildReferencedFileBlock(fs, message), message);
});

Deno.test('buildReferencedFileBlock inlines referenced content before the message', async () => {
  const fs = fakeFs({ 'daily/2025-01-15.md': '# Daily\nDid work.' });
  const result = await buildReferencedFileBlock(fs, 'Summarize @daily/2025-01-15.md');
  assert(result.includes('[Referenced files]'));
  assert(result.includes('--- daily/2025-01-15.md ---'));
  assert(result.includes('# Daily\nDid work.'));
  assert(result.endsWith('\nSummarize @daily/2025-01-15.md'));
});

Deno.test('buildReferencedFileBlock reports missing files', async () => {
  const fs = fakeFs({});
  const result = await buildReferencedFileBlock(fs, 'Check @missing-file.md');
  assert(result.includes('--- missing-file.md ---\n(not found)'));
});

Deno.test('buildReferencedFileBlock marks oversized files', async () => {
  const fs = fakeFs({ 'big.md': 'x'.repeat(25_000) });
  const result = await buildReferencedFileBlock(fs, 'Check @big.md');
  assert(result.includes('(too large to include - read it with the workspace tool)'));
});

Deno.test('buildReferencedFileBlock enforces the total context budget', async () => {
  const chunk = 'y'.repeat(18_000);
  const fs = fakeFs({
    'one.md': chunk,
    'two.md': chunk,
    'three.md': chunk,
    'four.md': chunk,
  });
  const result = await buildReferencedFileBlock(fs, 'Read @one.md @two.md @three.md @four.md');
  assert(result.includes('--- one.md ---'));
  assert(result.includes('--- three.md ---'));
  // 3 x 18k fits the budget; the fourth file must be skipped entirely.
  assert(
    result.includes(
      '--- four.md ---\n(skipped - the referenced-files context budget is exhausted)',
    ),
  );
});

Deno.test('buildReferencedFileBlock survives a per-file read failure', async () => {
  const fs = fakeFs({ 'ok.md': 'fine' }, ['bad.md']);
  const result = await buildReferencedFileBlock(fs, 'Read @bad.md and @ok.md');
  assert(result.includes('--- bad.md ---\n(unreadable: read failed for bad.md)'));
  assert(result.includes('fine'));
});

Deno.test('buildReferencedFileBlock inlines a folder listing for a folder mention', async () => {
  const fs = fakeFs({
    'daily/2025-01-14.md': 'yesterday',
    'daily/2025-01-15.md': 'today',
    'notes/a.md': 'note',
  });
  const result = await buildReferencedFileBlock(fs, 'Summarize @daily');
  assert(result.includes('--- daily ---'));
  assert(result.includes('(folder listing'));
  assert(result.includes('daily/2025-01-14.md'));
  assert(result.includes('daily/2025-01-15.md'));
});

Deno.test('folder listing includes subfolders and skips unknown @words', async () => {
  const fs = fakeFs({ 'daily/old/x.md': 'x' });
  const withFolder = await buildReferencedFileBlock(fs, 'Check @daily and subfolders');
  assert(withFolder.includes('old/'));

  // "@john" resolves to no directory, so the message stays untouched.
  const withoutFolder = await buildReferencedFileBlock(fs, 'Ping @john about tomorrow');
  assertEquals(withoutFolder, 'Ping @john about tomorrow');
});

Deno.test('empty folder mention reports an empty folder', async () => {
  const fs = fakeFs({}, [], ['archive']);
  const result = await buildReferencedFileBlock(fs, 'What is in @archive?');
  assert(result.includes('--- archive ---\n(empty folder)'));
});
