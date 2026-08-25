/// <reference lib="deno.ns" />
import { assertEquals } from '@std/assert';
import { filePathFromToolResult } from './tool-result.ts';

Deno.test('filePathFromToolResult reads the path from details.data.path', () => {
  const result = {
    content: [{ type: 'text', text: '📝 Saved note: notes/my-note.md' }],
    details: { data: { path: 'notes/my-note.md' }, message: '📝 Saved note: notes/my-note.md' },
  };
  assertEquals(filePathFromToolResult(result), 'notes/my-note.md');
});

Deno.test('filePathFromToolResult returns the daily path from details.data.path', () => {
  const result = {
    content: [
      {
        type: 'text',
        text: '📝 Saved daily work report for 2026-08-25.\n📄 File: daily/2026-08-25.md',
      },
    ],
    details: { data: { path: 'daily/2026-08-25.md' }, message: 'Saved daily work report' },
  };
  assertEquals(filePathFromToolResult(result), 'daily/2026-08-25.md');
});

Deno.test('filePathFromToolResult falls back to the path inside content text', () => {
  const result = {
    content: [{ type: 'text', text: '📄 File: debts/nam-6d98.md' }],
  };
  assertEquals(filePathFromToolResult(result), 'debts/nam-6d98.md');
});

Deno.test('filePathFromToolResult returns null when no path is reported', () => {
  assertEquals(filePathFromToolResult({ content: [{ type: 'text', text: 'Done.' }] }), null);
  assertEquals(filePathFromToolResult(null), null);
  assertEquals(filePathFromToolResult('a string'), null);
});
