import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
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

/**
 * Get batch size from environment or use default
 */
function getBatchSize(): number {
  const envBatchSize = Deno.env.get('DAILY_SUMMARY_BATCH_SIZE');
  return envBatchSize ? parseInt(envBatchSize, 10) : 10;
}

/**
 * Get schedule from environment variable or use default
 */
function getSchedule(): string {
  const envSchedule = Deno.env.get('DAILY_SUMMARY_SCHEDULE');
  if (envSchedule) {
    return envSchedule;
  }

  // Parse DAILY_SUMMARY_HOUR (0-23) and DAILY_SUMMARY_MINUTE (0-59)
  const hour = Deno.env.get('DAILY_SUMMARY_HOUR') || '9';
  const minute = Deno.env.get('DAILY_SUMMARY_MINUTE') || '0';
  return `${minute} ${hour} * * *`;
}

/**
 * Process array items in parallel batches
 */
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
 * Process daily work summary for single-user system (Phase 1: Local-First Architecture)
 */
async function processDailySummary(deps: SchedulerDeps): Promise<ProcessResult> {
  try {
    // Get workspace user's recent messages (single-user system)
    const messages = await deps.db.getMessagesByUserId('workspace-user');

    if (messages.length === 0) {
      return { success: false, reason: 'no_messages' };
    }

    // Generate summary using AI
    const latestMessage = messages[messages.length - 1];

    const result = await deps.agent.generateDailyWorkReport(latestMessage.content);

    // Check if report generation failed
    if (!result.success) {
      return { success: false, reason: result.error || 'report generation failed' };
    }

    const response = result.content || '';

    // Get workspace config to determine enabled platforms
    const config = await deps.db.getSubscriptionByUserId('workspace-user');
    if (!config) {
      return { success: false, reason: 'no_platforms_configured' };
    }

    // Send to each enabled platform (sequentially to avoid rate limits)
    for (const platform of config.enabled) {
      try {
        const bot = platform === 'slack' ? deps.slackBot : deps.telegramBot;
        const chatId = config.platforms[platform];

        if (!chatId) {
          console.error(`No chat ID found for ${platform}`);
          continue;
        }

        // Send formatted response directly (already formatted by capability)
        await bot.sendMessage(chatId, response);

        console.log(`Sent daily summary to workspace via ${platform}`);
      } catch (platformError) {
        console.error(`Failed to send to ${platform}:`, platformError);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to process daily summary:', error);
    return { success: false, reason: 'error' };
  }
}

/**
 * Start the daily summary scheduler using Deno.cron
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */
export async function startDailyScheduler(deps: SchedulerDeps): Promise<void> {
  const schedule = getSchedule();

  Deno.cron('daily-summary', schedule, async () => {
    const startTime = Date.now();
    console.log('Starting daily summary job at', new Date().toISOString());

    const result = await processDailySummary(deps);

    // Log summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log(`Daily summary completed in ${elapsed}s: successful`);
    } else {
      console.log(`Daily summary completed in ${elapsed}s: ${result.reason}`);
    }
  });

  console.log(`Daily scheduler started with schedule: ${schedule}`);
}
