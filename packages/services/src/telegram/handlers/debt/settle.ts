import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { Context } from 'grammy';
import { DebtTelegramFormatter } from '../../../formatters/debt-telegram-formatter.ts';
import { debtMenuKeyboard } from '../../keyboards.ts';

interface SettleHandlerDeps {
  db: Database;
  agent: AgentPort;
}

const formatter = new DebtTelegramFormatter();

export async function handleSettleCommand(ctx: Context, deps: SettleHandlerDeps): Promise<void> {
  const messageText = ctx.message?.text;
  const debtId = messageText?.split(/\s+/).slice(1).join(' ').trim();

  if (!debtId) {
    await ctx.reply(
      'Please provide a debt ID to settle.\n\n' +
        'Usage: /settle &lt;debt_id&gt;\n\n' +
        'Or use /debts to view debts and click "Mark Paid".',
      { parse_mode: 'HTML' },
    );
    return;
  }

  await settleDebt(ctx, deps, debtId, false);
}

export async function handleSettleCallback(
  ctx: Context,
  deps: SettleHandlerDeps,
  debtId: string,
): Promise<void> {
  await ctx.answerCallbackQuery();
  await settleDebt(ctx, deps, debtId, true);
}

async function settleDebt(
  ctx: Context,
  deps: SettleHandlerDeps,
  debtId: string,
  isEdit: boolean,
): Promise<void> {
  const debt = await deps.db.debts.getById(debtId);

  if (!debt) {
    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn('❌ Debt not found. It may have been deleted.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  if (debt.frontmatter.status === DebtStatus.PAID) {
    const message = formatter.formatDebtDocument(debt);
    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn(message + '\n\nℹ️ This debt is already marked as paid.', {
      reply_markup: formatter.debtItemKeyboard(debtId, debt.frontmatter.status),
      parse_mode: 'HTML',
    });
    return;
  }

  const updated = await deps.db.debts.settle(debtId);

  if (updated) {
    const directionText =
      debt.frontmatter.direction === DebtDirection.LENT
        ? `was paid back to you by ${debt.frontmatter.personName}`
        : `you paid back to ${debt.frontmatter.personName}`;

    const amount = new Intl.NumberFormat('vi-VN').format(debt.frontmatter.amount);

    const message =
      `✅ Debt marked as paid!\n\n` +
      `${amount} ${debt.frontmatter.currency} ${directionText}` +
      (debt.reason ? `\nReason: ${debt.reason}` : '');

    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn(message, {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
  } else {
    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn('❌ Failed to mark debt as paid. Please try again.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
  }
}
