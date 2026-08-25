/// <reference lib="deno.ns" />
import { assertEquals } from '@std/assert';
import type { FileNode } from '../lib/types.ts';
import {
  applyMention,
  fileMentionItems,
  filterMentionItems,
  findMentionQuery,
} from './file-mention.ts';

Deno.test('findMentionQuery returns the trailing query after @', () => {
  assertEquals(findMentionQuery('check @daily/2025'), 'daily/2025');
});

Deno.test('findMentionQuery returns empty string for a bare trailing @', () => {
  assertEquals(findMentionQuery('check @'), '');
  assertEquals(findMentionQuery('@'), '');
});

Deno.test('findMentionQuery returns null when no trailing mention', () => {
  assertEquals(findMentionQuery('no mention'), null);
  assertEquals(findMentionQuery('@done typing '), null);
  // Mid-text @ does not count: only a trailing token triggers the menu.
  assertEquals(findMentionQuery('user@example.com'), null);
  assertEquals(findMentionQuery('done @daily/2025-01-15.md next'), null);
});

Deno.test('applyMention replaces the trailing query with @path and a space', () => {
  assertEquals(applyMention('see @dai', 'daily/2025-01-15.md'), 'see @daily/2025-01-15.md ');
  assertEquals(applyMention('@', 'notes/a.md'), '@notes/a.md ');
});

Deno.test('fileMentionItems flattens the tree to mentionable files', () => {
  const nodes: FileNode[] = [
    {
      path: 'daily',
      name: 'daily',
      relativePath: 'daily',
      kind: 'folder',
      children: [
        {
          path: 'daily/2025-01-15.md',
          name: '2025-01-15.md',
          relativePath: 'daily/2025-01-15.md',
          kind: 'daily',
        },
      ],
    },
    { path: 'app.html', name: 'app.html', relativePath: 'app.html', kind: 'htmlApp' },
    { path: 'notes/a.md', name: 'a.md', relativePath: 'notes/a.md', kind: 'markdown' },
    { path: 'data.json', name: 'data.json', relativePath: 'data.json', kind: 'markdown' },
  ];
  const items = fileMentionItems(nodes);
  assertEquals(
    items.map((item) => item.id),
    ['daily', 'daily/2025-01-15.md', 'data.json', 'notes/a.md'],
  );
  assertEquals(items[0].label, 'daily');
  assertEquals(items[0].kind, 'folder');
  assertEquals(items[1].label, '2025-01-15.md');
  assertEquals(items[1].kind, 'daily');
});

Deno.test('filterMentionItems matches path and basename substrings', () => {
  const items = fileMentionItems([
    { path: 'daily/2025-01-15.md', name: '2025-01-15.md', relativePath: 'x', kind: 'daily' },
    {
      path: 'notes/meeting-notes.md',
      name: 'meeting-notes.md',
      relativePath: 'x',
      kind: 'markdown',
    },
  ]);
  assertEquals(filterMentionItems(items, '2025').length, 1);
  assertEquals(filterMentionItems(items, 'notes').length, 1);
  assertEquals(filterMentionItems(items, 'meeting').length, 1);
  assertEquals(filterMentionItems(items, ''), items);
  assertEquals(filterMentionItems(items, 'zzz'), []);
});
