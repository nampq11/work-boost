/**
 * Brain Prompts
 *
 * Modular prompt system for the Work Boost bot.
 */

// Debt prompts
export {
  DEBT_SYSTEM_PROMPT,
  DEBT_HUMAN_PROMPT,
  debtParseSchema,
  toParsedDebtEntry,
} from './debt/debt-prompt.ts';
export type { DebtParseResponse } from './debt/debt-prompt.ts';

// Daily work report prompts
export {
  SYSTEM_PROMPT as DAILY_WORK_SYSTEM_PROMPT,
  HUMAN_PROMPT as DAILY_WORK_HUMAN_PROMPT,
  dailyWorkSchema,
  formatDailyWorkReport,
} from './daily-work/daily-work-prompt.ts';
export type { DailyWorkReportResponse } from './daily-work/daily-work-prompt.ts';
export type { TaskItem } from '@work-boost/data-schemas/agent.ts';
