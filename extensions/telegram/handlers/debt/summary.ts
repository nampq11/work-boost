import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Context } from 'grammy';
import { DebtTelegramFormatter } from '../../../formatters/debt-telegram-formatter.ts';
import { debtMenuKeyboard } from '../../keyboards.ts';

interface SummaryHandlerDeps {
  db: Database;
  agent: AgentPort;
}

const formatter = new DebtTelegramFormatter();

export async function handleDebtSummary(ctx: Context, deps: SummaryHandlerDeps): Promise<void> {
  await showSummary(ctx, deps, false);
}

export async function handleSummaryCallback(ctx: Context, deps: SummaryHandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  await showSummary(ctx, deps, true);
}

async function showSummary(ctx: Context, deps: SummaryHandlerDeps, isEdit: boolean): Promise<void> {
  const summary = await deps.db.debts.getSummary();
  const message = formatter.formatDebtSummary(summary);

  const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await replyFn(message, {
    reply_markup: debtMenuKeyboard(),
    parse_mode: 'HTML',
  });
}
