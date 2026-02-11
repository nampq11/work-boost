import type { BotService } from '../../core/bot/bot-service.ts';
import type { Agent, Database } from '../_index.ts';
import { SlackFormatter } from '../formatting/slack-formatter.ts';
import { TelegramFormatter } from '../formatting/telegram-formatter.ts';

interface SchedulerDeps {
  db: Database;
  agent: Agent;
  slackBot: BotService;
  telegramBot: BotService;
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
 * Start the daily summary scheduler using Deno.cron
 *
 * @param deps - Dependencies including database, agent, and bot services
 */
export async function startDailyScheduler(deps: SchedulerDeps): Promise<void> {
  const schedule = getSchedule();
  const slackFormatter = new SlackFormatter();
  const telegramFormatter = new TelegramFormatter();

  Deno.cron(schedule, {
    fn: async () => {
      console.log('Starting daily summary job at', new Date().toISOString());

      const subscriptions = await deps.db.getAllActiveSubscriptions();

      console.log(`Found ${subscriptions.length} active subscriptions`);

      for (const sub of subscriptions) {
        try {
          // Get user's recent messages
          const messages = await deps.db.getMessagesByUserId(sub.userId);

          if (messages.length === 0) {
            console.log(`No messages found for user ${sub.userId}, skipping`);
            continue;
          }

          // Generate summary using AI
          const latestMessage = messages[messages.length - 1];
          const response = await deps.agent.envoke({
            content: latestMessage.content,
            verbose: false,
          });

          if (!response.success) {
            console.error(`Failed to generate summary for ${sub.userId}:`, response.error);
            continue;
          }

          // Send to each enabled platform
          for (const platform of sub.enabled) {
            try {
              const bot = platform === 'slack' ? deps.slackBot : deps.telegramBot;
              const chatId = sub.platforms[platform];

              if (!chatId) {
                console.error(`No chat ID found for ${platform} for user ${sub.userId}`);
                continue;
              }

              if (platform === 'slack') {
                const formatted = slackFormatter.format(response);
                await bot.sendMessage(chatId, formatted);
              } else {
                const parts = telegramFormatter.format(response);
                for (const part of parts) {
                  await bot.sendMessage(chatId, part, { parseMode: 'HTML' });
                }
              }

              console.log(`Sent daily summary to ${sub.userId} via ${platform}`);
            } catch (platformError) {
              console.error(`Failed to send to ${platform} for ${sub.userId}:`, platformError);
            }
          }

          // Update last sent timestamp
          await deps.db.updateLastSentAt(sub.userId, new Date());
        } catch (error) {
          console.error(`Failed to process subscription for ${sub.userId}:`, error);
        }
      }

      console.log('Daily summary job completed');
    },
  });

  console.log(`Daily scheduler started with schedule: ${schedule}`);
}
