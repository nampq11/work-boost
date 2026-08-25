import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { ConfigManager } from '@work-boost/data-provider';
import { successResult } from './result.ts';

/**
 * Get the current date and time in the workspace's configured timezone.
 */
export function createTimeTool(configMgr: ConfigManager): AgentTool<any> {
  return {
    name: 'get_current_time',
    label: 'Get Current Time',
    description:
      'Get the current date and time in the Workspace configured timezone. Call this tool when you need to determine today date or resolve relative time words like "today", "yesterday", "this week".',
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

      const localTime = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeStyle: 'full',
        dateStyle: 'full',
      }).format(now);

      const summary = `📅 ${localDate} | ${localTime} (Timezone: ${timezone})`;

      return successResult({ currentDate: localDate, fullTime: localTime, timezone }, summary);
    },
  };
}
