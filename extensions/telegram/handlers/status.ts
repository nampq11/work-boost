import { type Database, SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';
import type { Context } from 'grammy';
import { mainMenuKeyboard } from '../keyboards.ts';

interface StatusHandlerDeps {
  db: Database;
}

/**
 * Handle /status command - show subscription status
 */
export async function handleStatus(ctx: Context, deps: StatusHandlerDeps): Promise<void> {
  // Answer callback query if this is a button press
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }

  // Single-user system: all subscription methods operate on the workspace user.
  const subscription = await deps.db.getSubscriptionByUserId(SINGLE_USER_ID);

  if (!subscription) {
    await ctx.reply(
      '<b>Status</b>\n\nYou are not subscribed to daily summaries.\n\nUse /subscribe to start receiving daily work summaries!',
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() },
    );
    return;
  }

  const slackStatus = subscription.enabled.includes('slack') ? '✅ Active' : '❌ Inactive';
  const telegramStatus = subscription.enabled.includes('telegram') ? '✅ Active' : '❌ Inactive';

  const statusMessage =
    `<b>Status</b>\n\n` +
    `<b>Slack:</b> ${slackStatus}\n` +
    `<b>Telegram:</b> ${telegramStatus}\n` +
    `<b>Subscribed since:</b> ${new Date(subscription.subscribedAt).toLocaleDateString()}\n` +
    (subscription.lastSentAt
      ? `<b>Last summary sent:</b> ${new Date(subscription.lastSentAt).toLocaleDateString()}\n`
      : '');

  await ctx.reply(statusMessage, {
    parse_mode: 'HTML',
    reply_markup: mainMenuKeyboard(),
  });
}
