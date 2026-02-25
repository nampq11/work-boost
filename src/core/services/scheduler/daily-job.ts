import type { BotService } from '../../bot/bot-service.ts';
import type { Subscription } from '../../entity/subscription.ts';
import type { Agent, Database } from '../index.ts';

interface SchedulerDeps {
  db: Database;
  agent: Agent;
  slackBot: BotService;
  telegramBot: BotService;
}

interface ProcessResult {
  success: boolean;
  userId: string;
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
 * Process a single subscription - generate and send daily summary
 */
async function processSubscription(sub: Subscription, deps: SchedulerDeps): Promise<ProcessResult> {
  try {
    // Get user's recent messages
    const messages = await deps.db.getMessagesByUserId(sub.userId);

    if (messages.length === 0) {
      return { success: false, userId: sub.userId, reason: 'no_messages' };
    }

    // Generate summary using AI with daily-work-report capability
    const latestMessage = messages[messages.length - 1];

    // Use run() with capability to get the formatted response
    const { response } = await deps.agent.run(latestMessage.content, {
      sessionId: `daily_${sub.userId}`,
      capability: 'daily-work-report',
      verbose: false,
    });

    // Check if response contains an error
    if (response.startsWith('Error:')) {
      return { success: false, userId: sub.userId, reason: response };
    }

    // Send to each enabled platform (sequentially per user to avoid rate limits)
    // The response is already formatted by the capability, send directly
    for (const platform of sub.enabled) {
      try {
        const bot = platform === 'slack' ? deps.slackBot : deps.telegramBot;
        const chatId = sub.platforms[platform];

        if (!chatId) {
          console.error(`No chat ID found for ${platform} for user ${sub.userId}`);
          continue;
        }

        // Send formatted response directly (already formatted by capability)
        await bot.sendMessage(chatId, response);

        console.log(`Sent daily summary to ${sub.userId} via ${platform}`);
      } catch (platformError) {
        console.error(`Failed to send to ${platform} for ${sub.userId}:`, platformError);
      }
    }

    // Update last sent timestamp
    await deps.db.updateLastSentAt(sub.userId, new Date());

    return { success: true, userId: sub.userId };
  } catch (error) {
    console.error(`Failed to process subscription for ${sub.userId}:`, error);
    return { success: false, userId: sub.userId, reason: 'error' };
  }
}

/**
 * Start the daily summary scheduler using Deno.cron
 *
 * @param deps - Dependencies including database, agent, and bot services
 */
export async function startDailyScheduler(deps: SchedulerDeps): Promise<void> {
  const schedule = getSchedule();
  const batchSize = getBatchSize();

  Deno.cron('daily-summary', schedule, async () => {
    const startTime = Date.now();
    console.log('Starting daily summary job at', new Date().toISOString());

    const subscriptions = await deps.db.getAllActiveSubscriptions();
    console.log(`Found ${subscriptions.length} active subscriptions (batch size: ${batchSize})`);

    // Process subscriptions in parallel batches
    const results = await batchProcess(subscriptions, batchSize, (sub) =>
      processSubscription(sub, deps),
    );

    // Log summary
    const successCount = results.filter((r) => r.success).length;
    const noMessagesCount = results.filter((r) => !r.success && r.reason === 'no_messages').length;
    const errorCount = results.filter((r) => !r.success && r.reason !== 'no_messages').length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(
      `Daily summary completed in ${elapsed}s: ${successCount} successful, ${noMessagesCount} no messages, ${errorCount} errors`,
    );
  });

  console.log(`Daily scheduler started with schedule: ${schedule}, batch size: ${batchSize}`);
}
