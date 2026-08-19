import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { ConfigManager } from '@work-boost/data-provider';
import { successResult } from './result.ts';

/**
 * Get the current date and time in the workspace's configured timezone.
 */
export function createGetCurrentTimeTool(configMgr: ConfigManager): AgentTool<any> {
  return {
    name: 'get_current_time',
    label: 'Get Current Time',
    description:
      'Lấy ngày và giờ hiện tại theo Timezone đã cấu hình của Workspace. Gọi công cụ này khi cần xác định ngày hôm nay hoặc giải quyết các từ ngữ thời gian tương đối như "hôm nay", "hôm qua", "tuần này".',
    parameters: Type.Object({}),
    execute: async () => {
      const config = await configMgr.load();
      const timezone = config.timezone || 'Asia/Ho_Chi_Minh';
      const now = new Date();

      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);

      const localTime = new Intl.DateTimeFormat('vi-VN', {
        timeZone: timezone,
        timeStyle: 'full',
        dateStyle: 'full',
      }).format(now);

      const summary = `📅 Ngày ${localDate} | ${localTime} (Múi giờ: ${timezone})`;

      return successResult({ currentDate: localDate, fullTime: localTime, timezone }, summary);
    },
  };
}
