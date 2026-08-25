import type { FileNode } from '../lib/types.ts';

export interface FileMentionItem {
  id: string;
  label: string;
  description: string;
  kind: FileNode['kind'];
}

// Trailing @query at the end of the input; must start the token (beginning of
// text or after whitespace) so emails like user@example never trigger it.
const MENTION_QUERY_PATTERN = /(?:^|\s)@([\w./-]*)$/;

export function findMentionQuery(value: string): string | null {
  const match = MENTION_QUERY_PATTERN.exec(value);
  return match ? match[1] : null;
}

export function applyMention(value: string, path: string): string {
  return value.replace(/@[\w./-]*$/, `@${path} `);
}

const MENTIONABLE_EXTENSIONS = /\.(?:md|json|txt)$/i;

function flattenFiles(nodes: FileNode[], items: FileMentionItem[]): void {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      flattenFiles(node.children ?? [], items);
      continue;
    }
    // htmlApp files are not readable workspace documents for the assistant.
    if (node.kind === 'htmlApp' || !MENTIONABLE_EXTENSIONS.test(node.path)) continue;
    items.push({
      id: node.path,
      label: node.name,
      description: node.path,
      kind: node.kind,
    });
  }
}

export function fileMentionItems(nodes: FileNode[]): FileMentionItem[] {
  const items: FileMentionItem[] = [];
  flattenFiles(nodes, items);
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

export function filterMentionItems(items: FileMentionItem[], query: string): FileMentionItem[] {
  const needle = query.toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle),
  );
}
