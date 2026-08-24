import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import type { WorkspaceFS } from '@work-boost/data-provider';
import { successResult } from './result.ts';

const MAX_FILE_SIZE = 1000000; // 1 MB
const ALLOWED_EXTENSIONS = ['.md', '.json', '.txt'];
const MAX_SEARCH_RESULTS = 30;
const MAX_SNIPPET_LENGTH = 120;

const workspaceParams = Type.Object({
  action: StringEnum(['read', 'list', 'search'], {
    description: 'Hành động cần thực hiện trên workspace',
  }),
  path: Type.Optional(Type.String({ description: 'Đường dẫn file (ví dụ: daily/2025-01-15.md)' })),
  folder: Type.Optional(Type.String({ description: 'Thư mục con (mặc định: workspace root)' })),
  query: Type.Optional(Type.String({ description: 'Từ khóa cần tìm trong các file Markdown' })),
});

/**
 * Generic workspace file tool with an action discriminator.
 *
 * read and list are safe, generic file operations. search greps the Markdown
 * workspace so the agent can answer questions across notes, daily reports, and
 * debts without a per-domain query tool.
 */
export function createWorkspaceTool(fs: WorkspaceFS): AgentTool<typeof workspaceParams> {
  return {
    name: 'workspace',
    label: 'Workspace',
    description:
      'Đọc, liệt kê và tìm kiếm file trong workspace Markdown (notes, daily, debts). Dùng cho các câu hỏi cần xem nội dung hoặc tìm thông tin trong workspace.',
    parameters: workspaceParams,
    execute: async (_toolCallId, params) => {
      switch (params.action) {
        case 'read':
          return readFile(fs, params.path);
        case 'list':
          return listFiles(fs, params.folder);
        case 'search':
          return searchFiles(fs, params.query, params.folder);
        default:
          throw new Error(`Unknown workspace action: ${params.action}`);
      }
    },
  };
}

async function readFile(fs: WorkspaceFS, path?: string): Promise<AgentToolResult<unknown>> {
  if (!path) throw new Error('Thiếu path để đọc file.');

  const ext = path.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`File type "${ext}" not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  if (!(await fs.exists(path))) {
    throw new Error(`File not found: ${path}`);
  }

  const stat = await fs.stat(path);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(stat.size / 1000).toFixed(1)} KB). Max: 1 MB.`);
  }

  const content = await fs.readText(path);
  return successResult(
    { path, content, size: stat.size },
    `📄 ${path}\n\`\`\`\n${content}\n\`\`\``,
  );
}

async function listFiles(fs: WorkspaceFS, folder?: string): Promise<AgentToolResult<unknown>> {
  const files = folder ? await fs.listFiles(folder) : await fs.listFiles('');

  if (files.length === 0) {
    return successResult([], `📭 Thư mục "${folder || '.'}" trống.`);
  }

  const summary = files.map((f) => `  - ${f}`).join('\n');
  return successResult(files, `📁 ${folder || 'workspace'}\n${summary}`);
}

async function searchFiles(
  fs: WorkspaceFS,
  query?: string,
  folder?: string,
): Promise<AgentToolResult<unknown>> {
  const searchQuery = query?.trim().toLowerCase();
  if (!searchQuery) throw new Error('Thiếu query để tìm kiếm trong workspace.');

  const pattern = folder ? `${folder}/**/*.md` : '**/*.md';
  const files = await fs.listByGlob(pattern);

  const hits: { path: string; line: number; snippet: string }[] = [];
  for (const file of files) {
    const lines = (await fs.readText(file)).split('\n');
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(searchQuery)) {
        hits.push({
          path: file,
          line: index + 1,
          snippet: line.trim().slice(0, MAX_SNIPPET_LENGTH),
        });
      }
    });
  }

  if (hits.length === 0) {
    return successResult([], `🔍 Không tìm thấy "${searchQuery}".`);
  }

  const shown = hits.slice(0, MAX_SEARCH_RESULTS);
  const summary = shown.map((h) => `${h.path}:${h.line} - ${h.snippet}`).join('\n');
  const extra =
    hits.length > MAX_SEARCH_RESULTS
      ? `\n... và ${hits.length - MAX_SEARCH_RESULTS} kết quả khác`
      : '';
  return successResult(hits, `🔍 ${hits.length} kết quả cho "${searchQuery}":\n${summary}${extra}`);
}
