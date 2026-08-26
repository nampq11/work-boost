/// <reference lib="deno.ns" />

import type { AgentPort } from '@work-boost/brain';
import { type Database, SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';
import type { Logger } from '@work-boost/shared';
import type { ExtensionContext, ExtensionCronJob, ExtensionMessageSender } from '../types.ts';

export interface SchedulerDependencies {
  db: Database;
  agent: AgentPort;
  messaging?: ExtensionContext['messaging'];
  logger: Logger;
}

interface ProcessResult {
  success: boolean;
  reason?: string;
}

function getSchedule(): string {
  const configuredSchedule = Deno.env.get('DAILY_SUMMARY_SCHEDULE');
  // Default to end of day: the report should close the working day,
  // not open the next one (a morning run finds nothing to summarize).
  return configuredSchedule || '0 18 * * *';
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
        logger: ctx.logger,
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
    // Trailing 24h window (local time) instead of an exact UTC-day match:
    // it works for both evening reports and morning-after schedules.
    const recentMessages = await dependencies.db.getRecentMessagesByUserId(SINGLE_USER_ID, 1);
    if (recentMessages.length === 0) {
      return { success: false, reason: 'no_messages_today' };
    }

    const response = await dependencies.agent.stream(
      `Hãy tổng hợp công việc hôm nay dựa trên các tin nhắn sau: ${recentMessages
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
        dependencies.logger.error(`[Scheduler] Failed to send daily summary to ${platform}`, {
          error,
        });
      }
    }

    return delivered > 0 ? { success: true } : { success: false, reason: 'all_platforms_failed' };
  } catch (error) {
    dependencies.logger.error('[Scheduler] Failed to process daily summary', { error });
    return { success: false, reason: 'error' };
  }
}

export function createPlatformSender(
  db: Database,
  messaging: ExtensionContext['messaging'],
  logger: Logger,
): (message: string) => Promise<void> {
  return async (message) => {
    const subscription = await db.getSubscriptionByUserId(SINGLE_USER_ID);
    if (!subscription) return;

    for (const platform of subscription.enabled) {
      const sender = messaging?.[platform];
      const chatId = subscription.platforms[platform];
      if (!sender || !chatId) continue;
      try {
        await sendToPlatform(
          sender,
          chatId,
          message,
          platform === 'telegram' ? 'HTML' : 'None',
          logger,
        );
      } catch (error) {
        logger.error(`[Scheduler] Failed to send reminder to ${platform}`, { error });
      }
    }
  };
}

async function sendToPlatform(
  sender: ExtensionMessageSender,
  chatId: string,
  message: string,
  parseMode: 'HTML' | 'None',
  logger: Logger,
): Promise<void> {
  try {
    await sender.sendMessage(chatId, message, { parseMode });
  } catch (error) {
    if (parseMode === 'None') throw error;
    // HTML delivery falls back to plain text: agent output or a chunk split can
    // produce markup Telegram rejects, which would otherwise drop the reminder.
    logger.warn('HTML delivery failed, falling back to plain text', { error });
    await sender.sendMessage(chatId, stripHtmlTags(message), { parseMode: 'None' });
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}
