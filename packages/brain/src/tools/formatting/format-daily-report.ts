/**
 * Format Daily Report Tool
 *
 * Formats a daily work report for display
 */

import { logger } from '@work-boost/shared/logger/logger.ts';
import type { Tool } from '../../types.ts';
import { validateToolParams } from '../../validation.ts';
import { SCHEMAS } from '../../validation.ts';

/**
 * Create a format_daily_report tool
 * Formats a daily work report for display
 */
export function createFormatDailyReportTool(): Tool {
  return {
    name: 'format_daily_report',
    description:
      'Format a daily work report into a readable text message. Takes completed, incomplete, and planned tasks.',
    parameters: {
      type: 'object',
      properties: {
        completed: {
          type: 'array',
          description: 'List of completed tasks with project and task fields',
          items: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              task: { type: 'string' },
            },
          },
        },
        incomplete: {
          type: 'array',
          description: 'List of incomplete tasks with project and task fields',
          items: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              task: { type: 'string' },
            },
          },
        },
        planned: {
          type: 'array',
          description: 'List of planned tasks with project and task fields',
          items: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              task: { type: 'string' },
            },
          },
        },
      },
      required: ['completed', 'incomplete', 'planned'],
    },
    execute: async (params: unknown) => {
      // Validate parameters
      const validation = validateToolParams(params, SCHEMAS.formatDailyReport);
      if (!validation.valid) {
        logger.warn('Invalid format_daily_report parameters', { error: validation.error });
        return {
          success: false,
          error: validation.error || 'Validation failed',
        };
      }

      const { completed, incomplete, planned } = validation.data! as {
        completed: Array<{ project: string; task: string }>;
        incomplete: Array<{ project: string; task: string }>;
        planned: Array<{ project: string; task: string }>;
      };

      const formatTasks = (tasks: Array<{ project: string; task: string }>) => {
        if (tasks.length === 0) return ' •  N/A';
        return tasks
          .map((t) => {
            return ` •  ${t.project}: ${t.task}`;
          })
          .join('\n');
      };

      const text = `1. Việc hoàn thành hôm trước?
${formatTasks(completed)}
2. Việc dự định làm hôm trước nhưng không hoàn thành?
${formatTasks(incomplete)}
3. Việc dự định làm hôm nay?
${formatTasks(planned)}`;

      return {
        success: true,
        data: { text },
      };
    },
  };
}
