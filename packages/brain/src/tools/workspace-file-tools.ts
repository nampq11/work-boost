import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { WorkspaceFS } from '@work-boost/data-provider';
import { successResult } from './result.ts';

const MAX_FILE_SIZE = 1000000; // 1 MB
const ALLOWED_EXTENSIONS = ['.md', '.json', '.txt'];

const readWorkspaceFileParams = Type.Object({
  path: Type.String({ description: 'Đường dẫn file trong workspace (ví dụ: daily/2025-01-15.md)' }),
});

/**
 * Read a workspace file (markdown, JSON, or text) with size and extension guards.
 */
export function createReadWorkspaceFileTool(
  fs: WorkspaceFS,
): AgentTool<typeof readWorkspaceFileParams> {
  return {
    name: 'read_workspace_file',
    label: 'Read Workspace File',
    description:
      'Đọc nội dung một file trong workspace. Chỉ hỗ trợ file .md, .json, .txt và kích thước dưới 1MB.',
    parameters: readWorkspaceFileParams,
    execute: async (_toolCallId, params) => {
      const filePath = params.path;
      const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw new Error(
          `File type "${ext}" not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
        );
      }

      if (!(await fs.exists(filePath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_SIZE) {
        throw new Error(`File too large (${(stat.size / 1000).toFixed(1)} KB). Max: 1 MB.`);
      }

      const content = await fs.readText(filePath);
      return successResult(
        { path: filePath, content, size: stat.size },
        `📄 ${filePath}\n\`\`\`\n${content}\n\`\`\``,
      );
    },
  };
}

const listWorkspaceFilesParams = Type.Object({
  folder: Type.Optional(Type.String({ description: 'Thư mục con (mặc định: workspace root)' })),
});

/**
 * List files in a workspace folder.
 */
export function createListWorkspaceFilesTool(
  fs: WorkspaceFS,
): AgentTool<typeof listWorkspaceFilesParams> {
  return {
    name: 'list_workspace_files',
    label: 'List Workspace Files',
    description: 'Liệt kê các file trong một thư mục của workspace.',
    parameters: listWorkspaceFilesParams,
    execute: async (_toolCallId, params) => {
      const folder = params.folder;
      const files = folder ? await fs.listFiles(folder) : await fs.listFiles('');

      if (files.length === 0) {
        return successResult([], `📭 Thư mục "${folder || '.'}" trống.`);
      }

      const summary = files.map((f) => `  - ${f}`).join('\n');
      return successResult(files, `📁 ${folder || 'workspace'}\n${summary}`);
    },
  };
}
