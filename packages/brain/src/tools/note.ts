import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { WorkspaceFS } from '@work-boost/data-provider';
import { successResult } from './result.ts';

const createNoteParams = Type.Object({
  content: Type.String({ description: 'Nội dung của ghi chú (bắt buộc)' }),
  title: Type.Optional(
    Type.String({ description: 'Tiêu đề ghi chú (mặc định: không có tiêu đề)' }),
  ),
});

/**
 * Slugify a title into a safe filename token: lowercase, diacritics stripped,
 * runs of non-alphanumeric characters collapsed into a single dash, and
 * leading/trailing dashes trimmed. Falls back to 'note' when empty.
 */
function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'note';
}

/**
 * Build a timestamp suffix (YYYYMMDD-HHMMSS). Second precision only: callers
 * must handle same-second collisions themselves.
 */
function fileStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// Ceiling for collision retries; far beyond any realistic same-second capture
// rate, but prevents an unbounded loop against a misbehaving filesystem.
const MAX_PATH_ATTEMPTS = 100;

/**
 * Create a new note as a Markdown file under `notes/`.
 *
 * The tool is deliberately narrow: the model only supplies title/content. The
 * file path is derived here (slugified title plus a timestamp) and always kept
 * inside `notes/`, so the model can never write to an arbitrary path.
 */
export function createNoteTool(fs: WorkspaceFS): AgentTool<typeof createNoteParams> {
  return {
    name: 'create_note',
    label: 'Create Note',
    description:
      'Tạo một ghi chú mới dưới dạng file Markdown trong thư mục notes/. Dùng để lưu ý tưởng, thông tin hoặc nội dung tự do không thuộc công việc hay nợ nần.',
    parameters: createNoteParams,
    execute: async (_toolCallId, params) => {
      const { content, title } = params;

      if (!content.trim()) {
        throw new Error('Nội dung ghi chú không được để trống.');
      }

      const slug = slugify(title ?? '');
      const body = title ? `# ${title}\n\n${content}` : content;

      // Two captures with the same title in the same second produce the same
      // path; writeTextIfAbsent refuses to overwrite, so retry with a counter
      // suffix until a write lands.
      const stamp = fileStamp();
      let filePath = `notes/${slug}-${stamp}.md`;
      for (let attempt = 1; !(await fs.writeTextIfAbsent(filePath, body)); attempt++) {
        if (attempt >= MAX_PATH_ATTEMPTS) {
          throw new Error(
            `Không thể tạo ghi chú: đã thử ${MAX_PATH_ATTEMPTS} đường dẫn đều bị trùng.`,
          );
        }
        filePath = `notes/${slug}-${stamp}-${attempt}.md`;
      }

      return successResult({ path: filePath }, `📝 Đã lưu ghi chú: ${filePath}`);
    },
  };
}
