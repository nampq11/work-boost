import { assert, assertEquals } from '@std/assert';
import type { WorkspaceFS } from '@work-boost/data-provider';
import {
  buildReferencedFileBlock,
  parseFileReferences,
} from '../../apps/api/src/services/file-context.ts';

function fakeFs(files: Record<string, string>, failPaths: string[] = []): WorkspaceFS {
  return {
    exists: (path) => Promise.resolve(path in files || failPaths.includes(path)),
    readText: (path) =>
      failPaths.includes(path)
        ? Promise.reject(new Error(`read failed for ${path}`))
        : Promise.resolve(files[path] ?? ''),
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
