import type { Context } from 'grammy';
import { mainMenuKeyboard } from '../keyboards.ts';

/**
 * Handle /start command - show welcome message and main menu
 */
export async function handleStart(ctx: Context): Promise<void> {
  const welcomeMessage =
    `<b>Welcome to Work Boost!</b>\n\n` +
    `I'll send you daily work summaries powered by AI.\n\n` +
    `Choose an option below:`;

  await ctx.reply(welcomeMessage, {
    parse_mode: 'HTML',
    reply_markup: mainMenuKeyboard(),
  });
}

/**
 * Handle callback query for start action
 */
export async function handleStartCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  await handleStart(ctx);
}
