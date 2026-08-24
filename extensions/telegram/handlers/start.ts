import { type Database, SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';
import type { Context } from 'grammy';
import { mainMenuKeyboard } from '../keyboards.ts';

interface StartHandlerDeps {
  db: Database;
}

/**
 * Handle /start command - enable daily summaries by default and show the menu.
 * Daily summaries are the core loop of the product: onboarding should turn them
 * on rather than require an extra /subscribe step. /unsubscribe remains the opt-out.
 */
export async function handleStart(ctx: Context, deps: StartHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id?.toString();
  if (chatId) {
    try {
      const subscription = await deps.db.getSubscriptionByUserId(SINGLE_USER_ID);
      if (!subscription || !subscription.enabled.includes('telegram')) {
        // Enables Telegram and stores the chat ID in one write.
        await deps.db.setPlatformChatId(SINGLE_USER_ID, 'telegram', chatId);
      }
    } catch (error) {
      console.error('[Start] Failed to enable daily summaries:', error);
    }
  }

  const welcomeMessage =
    `<b>Welcome to Work Boost!</b>\n\n` +
    `I'll send you a daily work summary around 6pm - use /unsubscribe to stop.\n\n` +
    `Choose an option below:`;

  await ctx.reply(welcomeMessage, {
    parse_mode: 'HTML',
    reply_markup: mainMenuKeyboard(),
  });
}
