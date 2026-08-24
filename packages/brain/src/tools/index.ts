import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { DataLayer } from '@work-boost/data-provider';

import { createDailyWorkTool } from './daily-work.ts';
import { createDebtTool } from './debt.ts';
import { createNoteTool } from './note.ts';
import { createTimeTool } from './time.ts';
import { createWorkspaceTool } from './workspace.ts';

/**
 * Build the set of atomic, generic workspace tools for the Brain agent.
 * Each tool executes directly against the data layer (markdown files),
 * returning both structured details and a human-readable summary.
 */
export function getWorkspaceTools(dataLayer: DataLayer): AgentTool<any>[] {
  return [
    // Time
    createTimeTool(dataLayer.config),

    // Debt management
    createDebtTool(dataLayer.debts),

    // Daily work
    createDailyWorkTool(dataLayer.dailyWork),

    // Workspace files (read / list / search)
    createWorkspaceTool(dataLayer.fs),

    // Notes
    createNoteTool(dataLayer.fs),
  ];
}
