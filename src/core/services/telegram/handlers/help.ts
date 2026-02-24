import type { Context } from 'grammy';
import { mainMenuKeyboard } from '../keyboards.ts';

/**
 * Handle /help command - show help text
 */
export async function handleHelp(ctx: Context): Promise<void> {
  // Answer callback query if this is a button press
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }

  const helpMessage =
    `<b>Work Boost Help</b>\n\n` +
    `<b>Commands:</b>\n` +
    `/start - Start the bot and see main menu\n` +
    `/subscribe - Subscribe to daily work summaries\n` +
    `/unsubscribe - Unsubscribe from daily summaries\n` +
    `/status - Check your subscription status\n` +
    `/help - Show this help message\n\n` +
    `<b>How it works:</b>\n` +
    `1. Subscribe to receive daily summaries\n` +
    `2. Send your work updates anytime\n` +
    `3. Get AI-powered daily work reports\n\n` +
    `<b>Tips:</b>\n` +
    `• Use the buttons below for quick actions\n` +
    `• You can subscribe to both Slack and Telegram\n` +
    `• Reports are sent daily at the configured time`;

  await ctx.reply(helpMessage, {
    parse_mode: 'HTML',
    reply_markup: mainMenuKeyboard(),
  });
}

/**
 * @deprecated Use handleHelp directly - it now handles both commands and callbacks
 * Kept for backwards compatibility
 */
export async function handleHelpCallback(ctx: Context): Promise<void> {
  await handleHelp(ctx);
}
