import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { DocumentTemplate } from '@work-boost/data-provider';
import { successResult } from './result.ts';

const createDocumentParams = Type.Object({
  type: Type.String({
    description: 'Document type to create (e.g., note, debt, daily)',
  }),
  data: Type.Record(Type.String(), Type.Unknown(), {
    description: 'Data for the document type. See each type description for the required fields.',
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
      'Create a new document of a given type and save it to its own folder. Valid types: ' +
      validTypes.join(', ') +
      '. Use to create a note, a debt, or a daily work report.',
    parameters: createDocumentParams,
    execute: async (_toolCallId, params) => {
      const template = templates[params.type];
      if (!template) {
        throw new Error(
          `Invalid document type: ${params.type}. Valid types: ${validTypes.join(', ')}`,
        );
      }

      const data = template.schema.parse(params.data);
      const result = await template.create(data);
      return successResult({ path: result.path }, result.summary);
    },
  };
}
