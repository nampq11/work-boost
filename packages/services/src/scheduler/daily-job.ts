import type { AgentPort } from '@work-boost/brain';
import { type Database, SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';
import type { BotService } from '../bot/bot-service.ts';

interface SchedulerDeps {
  db: Database;
  agent: AgentPort;
  slackBot: BotService;
  telegramBot: BotService;
}

interface ProcessResult {
  success: boolean;
  reason?: string;
}

function getBatchSize(): number {
  const envBatchSize = Deno.env.get('DAILY_SUMMARY_BATCH_SIZE');
  return envBatchSize ? parseInt(envBatchSize, 10) : 10;
}

function getSchedule(): string {
  const envSchedule = Deno.env.get('DAILY_SUMMARY_SCHEDULE');
  if (envSchedule) {
    return envSchedule;
  }

  const hour = Deno.env.get('DAILY_SUMMARY_HOUR') || '9';
  const minute = Deno.env.get('DAILY_SUMMARY_MINUTE') || '0';
  return `${minute} ${hour} * * *`;
}

async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Process daily work summary for the workspace user.
 */
async function processDailySummary(deps: SchedulerDeps): Promise<ProcessResult> {
  try {
    const messages = await deps.db.getMessagesByUserId(SINGLE_USER_ID);

    if (messages.length === 0) {
      return { success: false, reason: 'no_messages' };
    }

    const latestMessage = messages[messages.length - 1];

    const response = await deps.agent.stream(
      `Hãy tóng hợp công việc hôm nay dựa trên tin nhắn sau: ${latestMessage.content}`,
      { sessionId: 'scheduler' },
    );

    const subscription = await deps.db.getSubscriptionByUserId(SINGLE_USER_ID);
    if (!subscription || subscription.enabled.length === 0) {
      return { success: false, reason: 'no_platforms_configured' };
    }

    let delivered = 0;

    for (const platform of subscription.enabled) {
      try {
        const bot = platform === 'slack' ? deps.slackBot : deps.telegramBot;
        const chatId = subscription.platforms[platform];

        if (!chatId) {
          console.error(`No chat ID found for ${platform}`);
          continue;
        }

        await bot.sendMessage(chatId, response);
        delivered++;

        console.log(`Sent daily summary to workspace via ${platform}`);
      } catch (platformError) {
        console.error(`Failed to send to ${platform}:`, platformError);
      }
    }

    return delivered > 0 ? { success: true } : { success: false, reason: 'all_platforms_failed' };
  } catch (error) {
    console.error('Failed to process daily summary:', error);
    return { success: false, reason: 'error' };
  }
}

/**
 * Start the daily summary scheduler using Deno.cron
 */
export async function startDailyScheduler(deps: SchedulerDeps): Promise<void> {
  const schedule = getSchedule();

  Deno.cron('daily-summary', schedule, async () => {
    const startTime = Date.now();
    console.log('Starting daily summary job at', new Date().toISOString());

    const result = await processDailySummary(deps);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log(`Daily summary completed in ${elapsed}s: successful`);
    } else {
      console.log(`Daily summary completed in ${elapsed}s: ${result.reason}`);
    }
  });

  console.log(`Daily scheduler started with schedule: ${schedule}`);
}
