import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Context } from 'grammy';
import { DebtTelegramFormatter } from '../../../debt-telegram-formatter.ts';
import { debtMenuKeyboard } from '../../keyboards.ts';

interface SummaryHandlerDeps {
  db: Database;
  agent: AgentPort;
}

const formatter = new DebtTelegramFormatter();

/**
 * Handle /debtsummary command - show debt summary
 */
export async function handleDebtSummary(ctx: Context, deps: SummaryHandlerDeps): Promise<void> {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  await showSummary(ctx, deps, userId, false);
}

/**
 * Handle summary callback from debt menu
 */
export async function handleSummaryCallback(ctx: Context, deps: SummaryHandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.editMessageText('Unable to identify user.');
    return;
  }

  await showSummary(ctx, deps, userId, true);
}

/**
 * Display the debt summary
 */
async function showSummary(
  ctx: Context,
  deps: SummaryHandlerDeps,
  userId: string,
  isEdit: boolean,
): Promise<void> {
  // Get the summary data
  const summary = await deps.db.getDebtSummary(userId);

  // Format the message
  const message = formatter.formatDebtSummary(summary);

  const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await replyFn(message, {
    reply_markup: debtMenuKeyboard(),
    parse_mode: 'HTML',
  });
}
