/**
 * Resolves @path references in an assistant message and inlines their context:
 * text files get their content embedded, folders get a listing of their
 * entries, so the agent works from the actual workspace instead of guessing.
 */

import type { WorkspaceFS } from '@work-boost/data-provider';

// Only text formats the workspace read tool allows; \b keeps the extension
// boundary (e.g. @notes.md.bak does not match as notes.md).
const FILE_REFERENCE_PATTERN = /@([\w./-]+?\.(?:md|json|txt))\b/gi;
const MAX_FILE_CHARS = 20_000;
const MAX_TOTAL_CHARS = 60_000;
const MAX_FOLDER_ENTRIES = 50;

// Any @token at a word boundary is a potential folder reference; it only
// becomes one if the path resolves to an actual workspace directory, which
// keeps "@john did X" and plain prose free of "(not found)" noise.
const MENTION_CANDIDATE_PATTERN = /(?:^|\s)@([\w./-]+)/g;

export function parseFileReferences(message: string): string[] {
  const refs = new Set<string>();
  for (const match of message.matchAll(FILE_REFERENCE_PATTERN)) {
    refs.add(match[1]);
  }
  return [...refs];
}

async function isWorkspaceDirectory(fs: WorkspaceFS, ref: string): Promise<boolean> {
  const separatorIndex = ref.lastIndexOf('/');
  const parent = separatorIndex === -1 ? '' : ref.slice(0, separatorIndex);
  const name = ref.slice(separatorIndex + 1);
  try {
    return (await fs.listDirs(parent)).includes(name);
  } catch {
    return false;
  }
}

async function resolveFolderReferences(
  fs: WorkspaceFS,
  message: string,
  fileRefs: string[],
): Promise<string[]> {
  const seen = new Set(fileRefs);
  const folders: string[] = [];
  for (const match of message.matchAll(MENTION_CANDIDATE_PATTERN)) {
    // Sentence punctuation right after the path ("see @daily.") must not
    // become part of the reference.
    const ref = match[1].replace(/\.+$/, '');
    if (!ref || seen.has(ref)) continue;
    if (!(await isWorkspaceDirectory(fs, ref))) continue;
    seen.add(ref);
    folders.push(ref);
  }
  return folders;
}

async function readFileSection(fs: WorkspaceFS, ref: string): Promise<string> {
  if (!(await fs.exists(ref))) return '(not found)';
  return await fs.readText(ref);
}

async function readFolderSection(fs: WorkspaceFS, ref: string): Promise<string> {
  const [files, dirs] = await Promise.all([fs.listFiles(ref), fs.listDirs(ref)]);
  const entries = [...files.sort(), ...dirs.sort().map((name) => `${name}/`)];
  if (entries.length === 0) return '(empty folder)';
  const shown = entries.slice(0, MAX_FOLDER_ENTRIES);
  const hidden = entries.length - shown.length;
  return [
    '(folder listing - call workspace action=read on a listed file for its content)',
    ...shown,
    ...(hidden > 0 ? [`(${hidden} more entries not shown)`] : []),
  ].join('\n');
}

function tooLargeNotice(path: string, reason: 'per-file' | 'total'): string {
  const suffix =
    reason === 'per-file'
      ? '(too large to include - read it with the workspace tool)'
      : '(skipped - the referenced-files context budget is exhausted)';
  return `--- ${path} ---\n${suffix}`;
}

export async function buildReferencedFileBlock(fs: WorkspaceFS, message: string): Promise<string> {
  const fileRefs = parseFileReferences(message);
  const folderRefs = await resolveFolderReferences(fs, message, fileRefs);
  if (fileRefs.length === 0 && folderRefs.length === 0) return message;

  const sections: Array<{ ref: string; render: () => Promise<string> }> = [];
  for (const ref of fileRefs) {
    sections.push({ ref, render: () => readFileSection(fs, ref) });
  }
  for (const ref of folderRefs) {
    sections.push({ ref, render: () => readFolderSection(fs, ref) });
  }

  const rendered: string[] = [];
  let totalUsed = 0;
  for (const section of sections) {
    let body: string;
    try {
      body = await section.render();
    } catch (error) {
      body = `(unreadable: ${error instanceof Error ? error.message : String(error)})`;
    }
    // Whole files only: partial inclusions would silently lose data, so an
    // oversized file (or one that would exhaust the total budget) is skipped
    // with an explicit notice the agent can relay.
    if (body.length > MAX_FILE_CHARS) {
      rendered.push(tooLargeNotice(section.ref, 'per-file'));
      continue;
    }
    if (totalUsed + body.length > MAX_TOTAL_CHARS) {
      rendered.push(tooLargeNotice(section.ref, 'total'));
      continue;
    }
    totalUsed += body.length;
    rendered.push(`--- ${section.ref} ---\n${body}`);
  }

  const block = [
    '[Referenced files]',
    "The user's message below references workspace paths with @path. Their current content (or, for folders, a listing of their files) is inlined here; use it directly and only call the workspace read tool when you genuinely need more.",
    '',
    ...rendered.flatMap((section) => [section, '']),
    '[End referenced files]',
  ].join('\n');

  return `${block}\n${message}`;
}
