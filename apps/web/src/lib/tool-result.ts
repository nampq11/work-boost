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
