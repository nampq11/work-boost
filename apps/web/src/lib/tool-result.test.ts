/// <reference lib="deno.ns" />
import { assertEquals } from '@std/assert';
import { filePathFromToolResult, lastSavedDailyPathFromThread } from './tool-result.ts';

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

Deno.test('lastSavedDailyPathFromThread returns the most recent daily save', () => {
  const messages = [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolName: 'create_document',
          args: { type: 'daily' },
          result: { details: { data: { path: 'daily/2026-08-24.md' } } },
        },
      ],
    },
    { role: 'user', content: [{ type: 'text', text: 'thanks' }] },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolName: 'create_document',
          args: { type: 'note' },
          result: { details: { data: { path: 'notes/idea.md' } } },
        },
        {
          type: 'tool-call',
          toolName: 'create_document',
          args: { type: 'daily' },
          result: { details: { data: { path: 'daily/2026-08-25.md' } } },
        },
      ],
    },
  ] as never[];

  assertEquals(lastSavedDailyPathFromThread(messages), 'daily/2026-08-25.md');
});

Deno.test('lastSavedDailyPathFromThread ignores notes, debts, and other tools', () => {
  const messages = [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolName: 'create_document',
          args: { type: 'debt' },
          result: { details: { data: { path: 'debts/john.md' } } },
        },
        {
          type: 'tool-call',
          toolName: 'daily_work_get',
          args: {},
          result: { details: { data: { path: 'daily/2026-08-25.md' } } },
        },
      ],
    },
  ] as never[];

  assertEquals(lastSavedDailyPathFromThread(messages), null);
});

Deno.test('lastSavedDailyPathFromThread returns null for an empty thread', () => {
  assertEquals(lastSavedDailyPathFromThread([]), null);
});
