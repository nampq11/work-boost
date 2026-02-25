/**
 * Brain Prompts
 *
 * Modular prompt system for the Work Boost bot.
 *
 * Module structure:
 * - debt/: Prompts for debt entry parsing
 * - daily-work/: Prompts for daily work report generation
 * - planning/: Prompts for plan generation
 */

// Types
export { SchemaType } from './types.ts';
export type { JsonSchema, ObjectSchemaProperty, ArraySchemaProperty, StringSchemaProperty } from './types.ts';

// Debt prompts
export {
  DEBT_SYSTEM_PROMPT,
  DEBT_HUMAN_PROMPT,
  debtParseSchema,
  toParsedDebtEntry,
} from './debt/index.ts';
export type { DebtParseResponse } from './debt/index.ts';

// Daily work report prompts
export {
  SYSTEM_PROMPT as DAILY_WORK_SYSTEM_PROMPT,
  HUMAN_PROMPT as DAILY_WORK_HUMAN_PROMPT,
  dailyWorkSchema,
} from './daily-work/index.ts';
export type { DailyWorkReportResponse, TaskItem } from './daily-work/index.ts';

// Planning prompts
export {
  PLAN_SYSTEM_PROMPT,
  planSchema,
} from './planning/index.ts';
export type { PlanData, PlanStepData } from './planning/index.ts';
