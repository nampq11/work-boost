import type { Context } from 'grammy';
import type { Agent, Database } from '../../../index.ts';
import { DebtTelegramFormatter } from '../../../formatting/debt-telegram-formatter.ts';
import { debtMenuKeyboard } from '../../keyboards.ts';

interface DeleteHandlerDeps {
  db: Database;
  agent: Agent;
}

const formatter = new DebtTelegramFormatter();

/**
 * Handle /delete command - delete a debt record
 * Usage: /delete <debt_id> or from callback
 */
export async function handleDeleteCommand(ctx: Context, deps: DeleteHandlerDeps): Promise<void> {
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
      'Please provide a debt ID to delete.\n\n' +
        'Usage: /delete &lt;debt_id&gt;\n\n' +
        'Or use /debts to view your debts and click "Delete".',
      { parse_mode: 'HTML' },
    );
    return;
  }

  await confirmDelete(ctx, deps, userId, debtId, false);
}

/**
 * Handle delete callback from debt item - show confirmation
 */
export async function handleDeleteCallback(
  ctx: Context,
  deps: DeleteHandlerDeps,
  debtId: string,
): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.editMessageText('Unable to identify user.');
    return;
  }

  await confirmDelete(ctx, deps, userId, debtId, true);
}

/**
 * Show delete confirmation dialog
 */
async function confirmDelete(
  ctx: Context,
  deps: DeleteHandlerDeps,
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
    await replyFn('❌ You can only delete your own debts.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  const message =
    '🗑 <b>Delete Debt?</b>\n\n' +
    formatter.formatDebtItem(debt, false) +
    '\n\n<b>This action cannot be undone.</b>\n\n' +
    'Are you sure you want to delete this debt record?';

  const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await replyFn(message, {
    reply_markup: formatter.confirmKeyboard('delete', debtId),
    parse_mode: 'HTML',
  });
}

/**
 * Handle delete confirmation callback
 */
export async function handleDeleteConfirm(
  ctx: Context,
  deps: DeleteHandlerDeps,
  debtId: string,
): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.editMessageText('Unable to identify user.');
    return;
  }

  // Get the debt to verify ownership
  const debt = await deps.db.getDebtById(debtId);

  if (!debt) {
    await ctx.editMessageText('❌ Debt not found. It may have already been deleted.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  if (debt.userId !== userId) {
    await ctx.editMessageText('❌ You can only delete your own debts.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  // Delete the debt
  const success = await deps.db.deleteDebt(debtId);

  if (success) {
    await ctx.editMessageText('✅ Debt deleted successfully.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
  } else {
    await ctx.editMessageText('❌ Failed to delete debt. Please try again.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
  }
}
