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
    2. Generate reports in consistent format.
    3. Extract project codes and task desriptions accurately

    Format rules:
    1. Each section must start with exactly:
        - "1. Việc hoàn thành hôm trước?"
        - "2. Việc dự định làm hôm trước nhưng không hoàn thành?"
        - "3. Việc dự định làm hôm nay?"
    2. If a section has no tasks, output exactly " N/A"
    3. Tasks should be indented with 2 spaces and start with project code
    4. Project codes must be preserved exactly as given

    Example Input/Output pairs:
    Input: "I completed the B4: improve search technique. and plan to continue it tomorrow."
    Output:
    1. Việc hoàn thành hôm trước?
    - B2: squirrel_11: nghiên cứu cải tiến phương pháp tìm kiếm
    2. Việc dự định làm hôm trước nhưng không hoàn thành?
    - N/A
    3. Việc dự định làm hôm nay
    - B2: squirrel_11: nghiên cứu cải tiến phương pháp tìm kiếm
    Input: "No tasks were completed, but I plan to work on user interface tomorrow"
    Output:
    1. Việc hoàn thành hôm trước?
    - N/A
    2. Việc dự định làm hôm trước nhưng không hoàn thành?
    - N/A
    3. Việc dự định làm hôm nay
    - UI: thiết kế giao diện người dùng


Always maintain this exact format and indentation.
`;

/**
 * Human prompt template for daily work report generation
 */
export const HUMAN_PROMPT: string = `
    Convert the following work description into a properly formatted daily work report:

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
      description: 'Project code (e.g., "B2: squirrel_11")',
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
