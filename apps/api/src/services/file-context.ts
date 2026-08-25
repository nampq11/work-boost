/**
 * Resolves @path file references in an assistant message and inlines their
 * content so the agent works from the actual files instead of guessing.
 */

import type { WorkspaceFS } from '@work-boost/data-provider';

// Only text formats the workspace read tool allows; \b keeps the extension
// boundary (e.g. @notes.md.bak does not match as notes.md).
const FILE_REFERENCE_PATTERN = /@([\w./-]+?\.(?:md|json|txt))\b/g;
const MAX_FILE_CHARS = 20_000;
const MAX_TOTAL_CHARS = 60_000;

export function parseFileReferences(message: string): string[] {
  const refs: string[] = [];
  for (const match of message.matchAll(FILE_REFERENCE_PATTERN)) {
    if (!refs.includes(match[1])) refs.push(match[1]);
  }
  return refs;
}

function tooLargeNotice(path: string, reason: 'per-file' | 'total'): string {
  const suffix =
    reason === 'per-file'
      ? '(too large to include - read it with the workspace tool)'
      : '(skipped - the referenced-files context budget is exhausted)';
  return `--- ${path} ---\n${suffix}`;
}

export async function buildReferencedFileBlock(fs: WorkspaceFS, message: string): Promise<string> {
  const refs = parseFileReferences(message);
  if (refs.length === 0) return message;

  const sections: string[] = [];
  let totalUsed = 0;

  for (const ref of refs) {
    try {
      if (!(await fs.exists(ref))) {
        sections.push(`--- ${ref} ---\n(not found)`);
        continue;
      }
      if (totalUsed >= MAX_TOTAL_CHARS) {
        sections.push(tooLargeNotice(ref, 'total'));
        continue;
      }
      const content = await fs.readText(ref);
      // Whole files only: partial inclusions would silently lose data, so an
      // oversized file (or one that would exhaust the total budget) is skipped
      // with an explicit notice the agent can relay.
      if (content.length > MAX_FILE_CHARS) {
        sections.push(tooLargeNotice(ref, 'per-file'));
        continue;
      }
      if (totalUsed + content.length > MAX_TOTAL_CHARS) {
        sections.push(tooLargeNotice(ref, 'total'));
        continue;
      }
      totalUsed += content.length;
      sections.push(`--- ${ref} ---\n${content}`);
    } catch (error) {
      sections.push(
        `--- ${ref} ---\n(unreadable: ${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  const block = [
    '[Referenced files]',
    "The user's message below references workspace files with @path. Their current content is inlined here; use it directly and only call the workspace read tool when you genuinely need more.",
    '',
    ...sections.flatMap((section) => [section, '']),
    '[End referenced files]',
  ].join('\n');

  return `${block}\n${message}`;
}
