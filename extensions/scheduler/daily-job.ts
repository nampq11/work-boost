import type { AgentPort } from '@work-boost/brain';
import { type Database, SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';
import type { ExtensionContext, ExtensionCronJob, ExtensionMessageSender } from '../types.ts';

export interface SchedulerDependencies {
  db: Database;
  agent: AgentPort;
  messaging?: ExtensionContext['messaging'];
}

interface ProcessResult {
  success: boolean;
  reason?: string;
}

function getSchedule(): string {
  const configuredSchedule = Deno.env.get('DAILY_SUMMARY_SCHEDULE');
  if (configuredSchedule) return configuredSchedule;

  const hour = Deno.env.get('DAILY_SUMMARY_HOUR') || '9';
  const minute = Deno.env.get('DAILY_SUMMARY_MINUTE') || '0';
  return `${minute} ${hour} * * *`;
}

export function createDailySummaryJob(ctx: ExtensionContext): ExtensionCronJob {
  return {
    name: 'daily-summary',
    schedule: getSchedule(),
    handler: async () => {
      const startTime = Date.now();
      const result = await processDailySummary({
        db: ctx.db,
        agent: ctx.agent,
        messaging: ctx.messaging,
      });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      ctx.logger.info(`[Scheduler] Daily summary completed in ${elapsed}s`, {
        status: result.success ? 'successful' : result.reason,
      });
    },
  };
}

export async function processDailySummary(
  dependencies: SchedulerDependencies,
): Promise<ProcessResult> {
  try {
    const messages = await dependencies.db.getMessagesByUserId(SINGLE_USER_ID);
    if (messages.length === 0) return { success: false, reason: 'no_messages' };

    const today = new Date().toISOString().slice(0, 10);
    const todaysMessages = messages.filter(
      (message) => message.date.toISOString().slice(0, 10) === today,
    );
    if (todaysMessages.length === 0) {
      return { success: false, reason: 'no_messages_today' };
    }

    const response = await dependencies.agent.stream(
      `Hãy tổng hợp công việc hôm nay dựa trên các tin nhắn sau: ${todaysMessages
        .map((message) => message.content)
        .join('\n')}`,
      {
        sessionId: 'scheduler',
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.trim()) return { success: false, reason: 'empty_response' };

    const subscription = await dependencies.db.getSubscriptionByUserId(SINGLE_USER_ID);
    if (!subscription || subscription.enabled.length === 0) {
      return { success: false, reason: 'no_platforms_configured' };
    }

    let delivered = 0;
    for (const platform of subscription.enabled) {
      const sender = dependencies.messaging?.[platform];
      const chatId = subscription.platforms[platform];
      if (!sender || !chatId) continue;

      try {
        await sender.sendMessage(chatId, response, { parseMode: 'None' });
        delivered++;
      } catch (error) {
        console.error(`[Scheduler] Failed to send daily summary to ${platform}`, error);
      }
    }

    return delivered > 0 ? { success: true } : { success: false, reason: 'all_platforms_failed' };
  } catch (error) {
    console.error('[Scheduler] Failed to process daily summary', error);
    return { success: false, reason: 'error' };
  }
}

export function createPlatformSender(
  db: Database,
  messaging: ExtensionContext['messaging'],
): (message: string) => Promise<void> {
  return async (message) => {
    const subscription = await db.getSubscriptionByUserId(SINGLE_USER_ID);
    if (!subscription) return;

    for (const platform of subscription.enabled) {
      const sender = messaging?.[platform];
      const chatId = subscription.platforms[platform];
      if (!sender || !chatId) continue;
      try {
        await sendToPlatform(sender, chatId, message, platform === 'telegram' ? 'HTML' : 'None');
      } catch (error) {
        console.error(`[Scheduler] Failed to send reminder to ${platform}`, error);
      }
    }
  };
}

async function sendToPlatform(
  sender: ExtensionMessageSender,
  chatId: string,
  message: string,
  parseMode: 'HTML' | 'None',
): Promise<void> {
  await sender.sendMessage(chatId, message, { parseMode });
}
