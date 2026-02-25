/**
 * Plan Generation Prompt
 *
 * System prompt for the LLM to generate execution plans.
 */

/**
 * JSON schema for plan generation
 */
export const planSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Brief summary of what the plan accomplishes (one sentence)',
    },
    steps: {
      type: 'array',
      description: 'List of steps to execute in order',
      items: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Human-readable description of what this step does',
          },
          action: {
            type: 'string',
            description: 'The tool or action to use',
          },
          parameters: {
            type: 'object',
            description: 'Parameters for the action (if applicable)',
          },
          expectedOutcome: {
            type: 'string',
            description: 'What we expect to happen after this step',
          },
        },
        required: ['description', 'action'],
      },
    },
    estimatedDuration: {
      type: 'number',
      description: 'Estimated total duration in milliseconds',
    },
  },
  required: ['summary', 'steps'],
} as const;

/**
 * Plan step interface
 */
export interface PlanStepData {
  description: string;
  action: string;
  parameters?: Record<string, unknown>;
  expectedOutcome?: string;
}

/**
 * Plan data interface
 */
export interface PlanData {
  summary: string;
  steps: PlanStepData[];
  estimatedDuration?: number;
}

/**
 * System prompt template for plan generation
 */
export const PLAN_SYSTEM_PROMPT = (tools: string[], maxSteps: number = 10): string => `You are a planning assistant for Work Boost bot.

Your job is to break down user requests into clear, executable steps.

Available tools:
${tools.join('\n')}

Rules:
1. Create at most ${maxSteps} steps
2. Each step should be atomic and independently verifiable
3. Use only the available tools listed above
4. Be specific about what each step does
5. Include expected outcomes so we can verify success
6. Estimate total duration (in milliseconds)

Output format: JSON with:
- summary: Brief one-sentence description
- steps: Array of step objects
- estimatedDuration: Total time estimate in ms

Example:
{
  "summary": "Create a new debt entry and send confirmation",
  "steps": [
    {
      "description": "Parse the user's natural language description",
      "action": "parse_debt_capability",
      "parameters": { "input": "I lent $50 to John for lunch" },
      "expectedOutcome": "Structured debt entry with direction, amount, person"
    },
    {
      "description": "Save the debt entry to database",
      "action": "create_debt",
      "parameters": { "userId": "user123", ...parsed_debt },
      "expectedOutcome": "Debt saved with ID"
    },
    {
      "description": "Send confirmation message to user",
      "action": "send_message",
      "parameters": { "platform": "telegram", "chatId": "...", "text": "Debt recorded!" },
      "expectedOutcome": "User receives confirmation"
    }
  ],
  "estimatedDuration": 3000
}

Now, analyze the user's request and create a plan.`;
