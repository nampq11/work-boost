/**
 * Daily Work Report Prompts
 *
 * Prompts for parsing natural language and generating structured work reports.
 */

import { SchemaType } from '../types.ts';

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
    Input: "No tasks were completed, but I plan to work on user interface tomorrow"
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
 * Task item schema for daily work reports
 */
const taskItemSchema = {
  type: SchemaType.OBJECT,
  properties: {
    project: {
      type: SchemaType.STRING,
      description: 'Project code (e.g., "B4")',
      nullable: false,
    },
    task: {
      type: SchemaType.STRING,
      description: 'Task description',
      nullable: false,
    },
  },
  required: ['project', 'task'],
} as const;

/**
 * Task array schema for daily work reports
 */
const taskArraySchema = {
  type: SchemaType.ARRAY,
  items: taskItemSchema,
} as const;

/**
 * JSON schema for daily work report response
 */
export const dailyWorkSchema = {
  description: 'Daily work report structure',
  type: SchemaType.OBJECT,
  properties: {
    completed: {
      description: 'Tasks completed from previous day',
      ...taskArraySchema,
    },
    incomplete: {
      description: 'Planned but incomplete tasks from previous day',
      ...taskArraySchema,
    },
    planned: {
      description: 'Tasks planned for today',
      ...taskArraySchema,
    },
  },
  required: ['completed', 'incomplete', 'planned'],
} as const;

/**
 * Task item interface
 */
export interface TaskItem {
  project: string;
  task: string;
}

/**
 * Daily work report response interface
 */
export interface DailyWorkReportResponse {
  completed: TaskItem[];
  incomplete: TaskItem[];
  planned: TaskItem[];
}
