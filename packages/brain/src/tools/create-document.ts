import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { DocumentTemplate } from '@work-boost/data-provider';
import { successResult } from './result.ts';

const createDocumentParams = Type.Object({
  type: Type.String({
    description: 'Loại tài liệu cần tạo (ví dụ: note, debt, daily)',
  }),
  data: Type.Record(Type.String(), Type.Unknown(), {
    description: 'Dữ liệu theo loại tài liệu. Xem mô tả từng loại để biết các trường bắt buộc.',
  }),
});

/**
 * Generic document creation tool.
 *
 * Dispatches to a template registry keyed by `type`, so adding a new document
 * type (note, debt, daily, ...) is a single registry entry and never a new
 * tool. The tool only validates the payload against the template's schema and
 * delegates the actual write to the template.
 */
export function createDocumentTool(
  templates: Record<string, DocumentTemplate>,
): AgentTool<typeof createDocumentParams> {
  const validTypes = Object.keys(templates);
  return {
    name: 'create_document',
    label: 'Create Document',
    description:
      'Tạo một tài liệu mới theo loại và lưu vào thư mục riêng của nó. Các loại hợp lệ: ' +
      validTypes.join(', ') +
      '. Dùng để tạo ghi chú (note), khoản nợ (debt) hoặc báo cáo công việc (daily).',
    parameters: createDocumentParams,
    execute: async (_toolCallId, params) => {
      const template = templates[params.type];
      if (!template) {
        throw new Error(
          `Loại tài liệu không hợp lệ: ${params.type}. Các loại hợp lệ: ${validTypes.join(', ')}`,
        );
      }

      const data = template.schema.parse(params.data);
      const result = await template.create(data);
      return successResult({ path: result.path }, result.summary);
    },
  };
}
