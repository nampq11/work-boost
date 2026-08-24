import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { DataLayer } from '@work-boost/data-provider';

import {
  createGetDailyWorkTool,
  createListDailyDatesTool,
  createSaveDailyWorkTool,
} from './daily-work-tools.ts';
import {
  createCreateDebtTool,
  createDeleteDebtTool,
  createGetDebtSummaryTool,
  createListDebtsTool,
  createSettleDebtTool,
} from './debt-tools.ts';
import { createCreateNoteTool } from './note-tools.ts';
import { createGetCurrentTimeTool } from './time-tools.ts';
import {
  createListWorkspaceFilesTool,
  createReadWorkspaceFileTool,
} from './workspace-file-tools.ts';

/**
 * Build the full set of atomic workspace tools for the Brain agent.
 * Each tool executes directly against the data layer (markdown files),
 * returning both structured details and a human-readable summary.
 */
export function getWorkspaceTools(dataLayer: DataLayer): AgentTool<any>[] {
  return [
    // Time
    createGetCurrentTimeTool(dataLayer.config),

    // Debt management
    createCreateDebtTool(dataLayer.debts),
    createListDebtsTool(dataLayer.debts),
    createSettleDebtTool(dataLayer.debts),
    createGetDebtSummaryTool(dataLayer.debts),
    createDeleteDebtTool(dataLayer.debts),

    // Daily work
    createSaveDailyWorkTool(dataLayer.dailyWork),
    createGetDailyWorkTool(dataLayer.dailyWork),
    createListDailyDatesTool(dataLayer.dailyWork),

    // Workspace files
    createReadWorkspaceFileTool(dataLayer.fs),
    createListWorkspaceFilesTool(dataLayer.fs),
    createCreateNoteTool(dataLayer.fs),
  ];
}
