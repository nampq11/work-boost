import type { ThreadMessage } from '@assistant-ui/react';
// Derive the file path a Work Boost write tool reported. The agent is
// instructed to reply with the saved file path, and write tools put it either
// in details.data.path (create_document) or inside the content summary text
// (e.g. "File: daily/2026-08-25.md"). Deriving the path from tool results is
// more reliable than parsing the assistant's prose.
export function filePathFromToolResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const details = (result as { details?: unknown }).details;
  if (details && typeof details === 'object') {
    const data = (details as { data?: unknown }).data;
    if (data && typeof data === 'object' && typeof (data as { path?: unknown }).path === 'string') {
      return (data as { path: string }).path;
    }
  }
  const content = (result as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const text = content
      .filter(
        (part): part is { type: string; text: string } =>
          Boolean(part) &&
          typeof part === 'object' &&
          (part as { type?: unknown }).type === 'text' &&
          typeof (part as { text?: unknown }).text === 'string',
      )
      .map((part) => part.text)
      .join('\n');
    const match = text.match(/(?:daily|notes|debts|archive)\/[A-Za-z0-9._-]+\.md/);
    if (match) return match[0];
  }
  return null;
}

// Scan the thread backwards for the most recent daily report the assistant
// saved via create_document, so Today can show "grounded in Markdown". Notes
// and debts go through the same tool but are not today's work report.
export function lastSavedDailyPathFromThread(messages: readonly ThreadMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    const content = message.content;
    for (let j = content.length - 1; j >= 0; j--) {
      const part = content[j];
      if (part.type !== 'tool-call' || part.toolName !== 'create_document') continue;
      if ((part.args as { type?: unknown }).type !== 'daily') continue;
      const path = filePathFromToolResult(part.result);
      if (path) return path;
    }
  }
  return null;
}
