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

export const HUMAN_PROMPT: string = `
    Convert the following work description into a properly formatted daily work report:

    {USER_INPUT}
`;

enum SchemaType {
  ARRAY = 'array',
  OBJECT = 'object',
  STRING = 'string',
  BOOLEAN = 'boolean',
}

export const dailyWorkSchema = {
  description: 'Daily work report structure',
  type: SchemaType.OBJECT,
  properties: {
    completed: {
      description: 'Tasks completed from previous day',
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          project: {
            type: SchemaType.STRING,
            description: "Project code (e.g., 'B2: squirrel_11')",
            nullable: false,
          },
          task: {
            type: SchemaType.STRING,
            description: 'Task description',
            nullable: false,
          },
        },
        required: ['project', 'task'],
      },
    },
    incomplete: {
      description: 'Planned but incomplete tasks from previous day',
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          project: {
            type: SchemaType.STRING,
            description: 'Project code',
            nullable: false,
          },
          task: {
            type: SchemaType.STRING,
            description: 'Task description',
            nullable: false,
          },
        },
        required: ['project', 'task'],
      },
    },
    planned: {
      description: 'Tasks planned for today',
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          project: {
            type: SchemaType.STRING,
            description: 'Project code',
            nullable: false,
          },
          task: {
            type: SchemaType.STRING,
            description: 'Task description',
            nullable: false,
          },
        },
        required: ['project', 'task'],
      },
    },
  },
  required: ['completed', 'incomplete', 'planned'],
};
