import type { Context } from 'grammy';
import type { Database } from '../../../services/database/database.ts';
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

  const fromId = ctx.from?.id.toString();

  if (!fromId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  const subscription = await deps.db.getSubscriptionByUserId(fromId);

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

/**
 * @deprecated Use handleStatus directly - it now handles both commands and callbacks
 * Kept for backwards compatibility
 */
export async function handleStatusCallback(ctx: Context, deps: StatusHandlerDeps): Promise<void> {
  await handleStatus(ctx, deps);
}
