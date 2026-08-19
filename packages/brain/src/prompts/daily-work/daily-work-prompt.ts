/**
 * Daily Work Report Prompts
 *
 * Prompts for parsing natural language and generating structured work reports.
 */

import { type Static, Type } from '@earendil-works/pi-ai';
import type { DailyWorkReport, TaskItem } from '@work-boost/data-schemas/agent.ts';

/**
 * System prompt for daily work report generation
 */
export const SYSTEM_PROMPT: string = `
    You are a daily work report assistant. Your role is to:
    1. Parse daily work reports in Vietnamese.
    2. Extract tasks into structured report sections.
    3. Extract project codes and task descriptions accurately.

    Return only a JSON object with these three arrays:
    - completed: tasks completed from the previous day
    - incomplete: tasks planned for the previous day but not completed
    - planned: tasks planned for today

    Each array item must be an object with exactly two string fields:
    - project: the project code, preserved exactly as given
    - task: the task description

    If a section has no tasks, use an empty array. Project codes must be preserved
    exactly as given; do not invent project identifiers absent from the input.

    Example Input/Output pairs:
    Input: "I completed the B4: improve search technique. and plan to continue it tomorrow."
    Output:
    {
      "completed": [{ "project": "B4", "task": "cải thiện kỹ thuật tìm kiếm" }],
      "incomplete": [],
      "planned": [{ "project": "B4", "task": "cải thiện kỹ thuật tìm kiếm" }]
    }
    Input: "No tasks were completed, but I plan to work on UI tomorrow"
    Output:
    {
      "completed": [],
      "incomplete": [],
      "planned": [{ "project": "UI", "task": "thiết kế giao diện người dùng" }]
    }

Always respond with only the JSON object described above, matching the response schema.
`;

/**
 * Human prompt template for daily work report generation
 */
export const HUMAN_PROMPT: string = `
    Convert the following work description into the required structured JSON report:

    {USER_INPUT}
`;

/**
 * TypeBox schema for a single task item in a daily work report
 */
const taskItemSchema = Type.Object(
  {
    project: Type.String({ description: 'Project code (e.g., "B4")' }),
    task: Type.String({ description: 'Task description' }),
  },
  { description: 'A single task item' },
);

/**
 * TypeBox schema for the daily work report response.
 * The model is steered toward this schema via the response tool in
 * completeStructured, and validated against it before returning.
 */
export const dailyWorkSchema = Type.Object(
  {
    completed: Type.Array(taskItemSchema, { description: 'Tasks completed from previous day' }),
    incomplete: Type.Array(taskItemSchema, {
      description: 'Planned but incomplete tasks from previous day',
    }),
    planned: Type.Array(taskItemSchema, { description: 'Tasks planned for today' }),
  },
  { description: 'Daily work report structure' },
);

/**
 * Daily work report response type
 */
export type DailyWorkReportResponse = Static<typeof dailyWorkSchema>;

/**
 * Format a daily work report for Slack/Telegram
 */
export function formatDailyWorkReport(report: DailyWorkReport): string {
  const formatTasks = (tasks: TaskItem[]) => {
    if (tasks.length === 0) return ' •  N/A';
    return tasks
      .map((task) => {
        return ` •  ${task.project}: ${task.task}`;
      })
      .join('\n');
  };

  return `1. Việc hoàn thành hôm trước?
${formatTasks(report.completed)}
2. Việc dự định làm hôm trước nhưng không hoàn thành?
${formatTasks(report.incomplete)}
3. Việc dự định làm hôm nay?
${formatTasks(report.planned)}`;
}
