import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import { formatDailyReport } from '@work-boost/data-provider';
import type { DailyWorkRepository } from '@work-boost/data-provider';
import { successResult } from './result.ts';

const dailyWorkParams = Type.Object({
  action: StringEnum(['get', 'list_dates'], {
    description: 'Action to perform on a daily work report',
  }),
  date: Type.Optional(Type.String({ description: 'Date (ISO date YYYY-MM-DD)' })),
  includeRaw: Type.Optional(Type.Boolean({ description: 'Return raw markdown if true' })),
});

/**
 * Generic daily-work tool with an action discriminator.
 *
 * Saving a report is handled by the `create_document` tool (type=daily); this
 * tool covers the read paths: get returns a formatted report for a date, and
 * list_dates enumerates every date that already has a report.
 */
export function createDailyWorkTool(
  dailyWork: DailyWorkRepository,
): AgentTool<typeof dailyWorkParams> {
  return {
    name: 'daily_work',
    label: 'Daily Work',
    description:
      'View daily work reports: get the report for a date and list the dates that have one. To save a new report, use create_document with type=daily.',
    parameters: dailyWorkParams,
    execute: async (_toolCallId, params) => {
      switch (params.action) {
        case 'get':
          return getDailyWork(dailyWork, params);
        case 'list_dates':
          return listDailyDates(dailyWork);
        default:
          throw new Error(`Unknown daily_work action: ${params.action}`);
      }
    },
  };
}

async function getDailyWork(
  dailyWork: DailyWorkRepository,
  params: { date?: string; includeRaw?: boolean },
): Promise<AgentToolResult<unknown>> {
  const { date, includeRaw } = params;
  if (!date) throw new Error('Missing date to view the daily work report.');

  const doc = await dailyWork.get(date);

  if (!doc) {
    return successResult(null, `❌ No daily work report found for ${date}.`);
  }

  const summary = formatDailyReport(doc.report, doc.customSections);
  const details = includeRaw ? { ...doc, rawMarkdown: doc.rawMarkdown } : doc;

  return successResult(details, `📅 ${date}\n\n${summary}\n📄 File: ${doc.filePath}`);
}

async function listDailyDates(dailyWork: DailyWorkRepository): Promise<AgentToolResult<unknown>> {
  const dates = await dailyWork.listDates();

  if (dates.length === 0) {
    return successResult([], '📭 No daily work reports yet.');
  }

  const summary = dates
    .sort()
    .reverse()
    .map((d) => `  - ${d}`)
    .join('\n');

  return successResult(dates, `📅 Dates with reports:\n${summary}`);
}
