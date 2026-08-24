import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import type { DailyWorkRepository } from '@work-boost/data-provider';
import { formatDailyReport } from '@work-boost/data-provider';
import type { TaskItem } from '@work-boost/data-schemas/agent.ts';
import { successResult } from './result.ts';

const TaskItemSchema = Type.Object({
  project: Type.String({ description: 'Tên dự án' }),
  task: Type.String({ description: 'Mô tả công việc' }),
});

const dailyWorkParams = Type.Object({
  action: StringEnum(['save', 'get', 'list_dates'], {
    description: 'Hành động cần thực hiện trên báo cáo công việc',
  }),
  date: Type.Optional(Type.String({ description: 'Ngày (ISO date YYYY-MM-DD)' })),
  completed: Type.Optional(
    Type.Array(TaskItemSchema, { description: 'Các công việc đã hoàn thành' }),
  ),
  incomplete: Type.Optional(
    Type.Array(TaskItemSchema, { description: 'Các công việc chưa hoàn thành' }),
  ),
  planned: Type.Optional(Type.Array(TaskItemSchema, { description: 'Kế hoạch cho ngày hôm nay' })),
  includeRaw: Type.Optional(Type.Boolean({ description: 'Trả về raw markdown nếu true' })),
});

/**
 * Generic daily-work tool with an action discriminator.
 *
 * Keeps the same semantics as the original narrow tools: save picks a date and
 * three task sections, get returns a formatted report, list_dates enumerates
 * every date that already has a report.
 */
export function createDailyWorkTool(
  dailyWork: DailyWorkRepository,
): AgentTool<typeof dailyWorkParams> {
  return {
    name: 'daily_work',
    label: 'Daily Work',
    description:
      'Quản lý báo cáo công việc hằng ngày: lưu tiến độ, xem báo cáo của một ngày, và liệt kê các ngày đã ghi.',
    parameters: dailyWorkParams,
    execute: async (_toolCallId, params) => {
      switch (params.action) {
        case 'save':
          return saveDailyWork(dailyWork, params);
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

async function saveDailyWork(
  dailyWork: DailyWorkRepository,
  params: { date?: string; completed?: TaskItem[]; incomplete?: TaskItem[]; planned?: TaskItem[] },
): Promise<AgentToolResult<unknown>> {
  const { date, completed, incomplete, planned } = params;
  if (!date) throw new Error('Thiếu date để lưu báo cáo công việc.');

  const report = {
    completed: completed ?? [],
    incomplete: incomplete ?? [],
    planned: planned ?? [],
  };

  const doc = await dailyWork.save(date, report);

  return successResult(doc, `📝 Đã lưu báo cáo công việc ngày ${date}.\n📄 File: ${doc.filePath}`);
}

async function getDailyWork(
  dailyWork: DailyWorkRepository,
  params: { date?: string; includeRaw?: boolean },
): Promise<AgentToolResult<unknown>> {
  const { date, includeRaw } = params;
  if (!date) throw new Error('Thiếu date để xem báo cáo công việc.');

  const doc = await dailyWork.get(date);

  if (!doc) {
    return successResult(null, `❌ Không tìm thấy báo cáo công việc ngày ${date}.`);
  }

  const summary = formatDailyReport(doc.report, doc.customSections);
  const details = includeRaw ? { ...doc, rawMarkdown: doc.rawMarkdown } : doc;

  return successResult(details, `📅 ${date}\n\n${summary}\n📄 File: ${doc.filePath}`);
}

async function listDailyDates(dailyWork: DailyWorkRepository): Promise<AgentToolResult<unknown>> {
  const dates = await dailyWork.listDates();

  if (dates.length === 0) {
    return successResult([], '📭 Chưa có báo cáo công việc nào.');
  }

  const summary = dates
    .sort()
    .reverse()
    .map((d) => `  - ${d}`)
    .join('\n');

  return successResult(dates, `📅 Các ngày có báo cáo:\n${summary}`);
}
