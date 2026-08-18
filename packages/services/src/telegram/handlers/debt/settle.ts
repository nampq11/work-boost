import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { Context } from 'grammy';
import { DebtTelegramFormatter } from '../../../formatters/debt-telegram-formatter.ts';
import { debtMenuKeyboard } from '../../keyboards.ts';

interface SettleHandlerDeps {
  db: Database;
  agent: AgentPort;
}

const formatter = new DebtTelegramFormatter();

/**
 * Handle /settle command - mark a debt as paid
 * Usage: /settle <debt_id> or from callback
 */
export async function handleSettleCommand(ctx: Context, deps: SettleHandlerDeps): Promise<void> {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  // Get debt ID from command argument
  const messageText = ctx.message?.text;
  const debtId = messageText?.split(/\s+/).slice(1).join(' ').trim();

  if (!debtId) {
    await ctx.reply(
      'Please provide a debt ID to settle.\n\n' +
        'Usage: /settle &lt;debt_id&gt;\n\n' +
        'Or use /debts to view your debts and click "Mark Paid".',
      { parse_mode: 'HTML' },
    );
    return;
  }

  await settleDebt(ctx, deps, userId, debtId, false);
}

/**
 * Handle settle callback from debt item
 */
export async function handleSettleCallback(
  ctx: Context,
  deps: SettleHandlerDeps,
  debtId: string,
): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.editMessageText('Unable to identify user.');
    return;
  }

  await settleDebt(ctx, deps, userId, debtId, true);
}

/**
 * Settle a debt record
 */
async function settleDebt(
  ctx: Context,
  deps: SettleHandlerDeps,
  userId: string,
  debtId: string,
  isEdit: boolean,
): Promise<void> {
  // Get the debt
  const debt = await deps.db.getDebtById(debtId);

  if (!debt) {
    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn('❌ Debt not found. It may have been deleted.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  // Verify ownership
  if (debt.userId !== userId) {
    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn('❌ You can only settle your own debts.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  // Check if already paid
  if (debt.status === DebtStatus.PAID) {
    const message = formatter.formatDebtItem(debt, false);
    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn(message + '\n\nℹ️ This debt is already marked as paid.', {
      reply_markup: formatter.debtItemKeyboard(debtId, debt.status),
      parse_mode: 'HTML',
    });
    return;
  }

  // Update the debt
  const updated = await deps.db.settleDebt(debtId);

  if (updated) {
    const directionText =
      debt.direction === 'lent'
        ? `was paid back by ${debt.personName}`
        : `you paid back to ${debt.personName}`;

    const message =
      `✅ Debt marked as paid!\n\n` +
      `${formatter.formatCurrency(updated.amount, updated.currency)} ${directionText}` +
      (updated.reason ? `\nReason: ${updated.reason}` : '');

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
