import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { DailyWorkRepository } from '@work-boost/data-provider';
import { formatDailyReport } from '@work-boost/data-provider';
import type { DailyWorkDocument, TaskItem } from '@work-boost/data-schemas/agent.ts';
import { successResult } from './result.ts';

const TaskItemSchema = Type.Object({
  project: Type.String({ description: 'Tên dự án' }),
  task: Type.String({ description: 'Mô tả công việc' }),
});

const saveDailyWorkParams = Type.Object({
  date: Type.String({ description: 'Ngày (ISO date YYYY-MM-DD)' }),
  completed: Type.Array(TaskItemSchema, { description: 'Các công việc đã hoàn thành' }),
  incomplete: Type.Array(TaskItemSchema, { description: 'Các công việc chưa hoàn thành' }),
  planned: Type.Array(TaskItemSchema, { description: 'Kế hoạch cho ngày hôm nay' }),
});

/**
 * Save today's daily work report as a Markdown file.
 */
export function createSaveDailyWorkTool(
  dailyWork: DailyWorkRepository,
): AgentTool<typeof saveDailyWorkParams> {
  return {
    name: 'save_daily_work',
    label: 'Save Daily Work',
    description:
      'Lưu báo cáo công việc hàng ngày dưới dạng file Markdown. Gọi khi người dùng cung cấp thông tin hoàn thành/chưa hoàn thành hoặc khi kết thúc ngày.',
    parameters: saveDailyWorkParams,
    execute: async (_toolCallId, params) => {
      const { date, completed, incomplete, planned } = params;

      const report = {
        completed: completed as TaskItem[],
        incomplete: incomplete as TaskItem[],
        planned: planned as TaskItem[],
      };

      const doc = await dailyWork.save(date, report);

      return successResult(
        doc,
        `📝 Đã lưu báo cáo công việc ngày ${date}.\n📄 File: ${doc.filePath}`,
      );
    },
  };
}

const getDailyWorkParams = Type.Object({
  date: Type.String({ description: 'Ngày cần xem (ISO date YYYY-MM-DD)' }),
  includeRaw: Type.Optional(Type.Boolean({ description: 'Trả về raw markdown nếu true' })),
});

/**
 * Get a daily work report for a specific date.
 */
export function createGetDailyWorkTool(
  dailyWork: DailyWorkRepository,
): AgentTool<typeof getDailyWorkParams> {
  return {
    name: 'get_daily_work',
    label: 'Get Daily Work',
    description:
      'Lấy báo cáo công việc hàng ngày của một ngày cụ thể. Gọi khi người dùng hỏi về công việc đã hoàn thành/ngày hôm nay/ngày hôm qua.',
    parameters: getDailyWorkParams,
    execute: async (_toolCallId, params) => {
      const { date, includeRaw } = params;
      const doc = await dailyWork.get(date);

      if (!doc) {
        return successResult(null, `❌ Không tìm thấy báo cáo công việc ngày ${date}.`);
      }

      const summary = formatDailyReport(doc.report, doc.customSections);
      const details = includeRaw ? { ...doc, rawMarkdown: doc.rawMarkdown } : doc;

      return successResult(details, `📅 ${date}\n\n${summary}\n📄 File: ${doc.filePath}`);
    },
  };
}

/**
 * List all dates that have daily work reports.
 */
export function createListDailyDatesTool(dailyWork: DailyWorkRepository): AgentTool<any> {
  return {
    name: 'list_daily_dates',
    label: 'List Daily Dates',
    description: 'Liệt kê tất cả các ngày đã có báo cáo công việc.',
    parameters: Type.Object({}),
    execute: async () => {
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
    },
  };
}
