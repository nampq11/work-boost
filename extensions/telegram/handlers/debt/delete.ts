import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Context } from 'grammy';
import { DebtTelegramFormatter } from '../../../formatters/debt-telegram-formatter.ts';
import { debtConfirmKeyboard, debtMenuKeyboard } from '../../keyboards.ts';

interface DeleteHandlerDeps {
  db: Database;
  agent: AgentPort;
}

const formatter = new DebtTelegramFormatter();

export async function handleDeleteCommand(ctx: Context, deps: DeleteHandlerDeps): Promise<void> {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  const messageText = ctx.message?.text;
  const debtId = messageText?.split(/\s+/).slice(1).join(' ').trim();

  if (!debtId) {
    await ctx.reply(
      'Please provide a debt ID to delete.\n\n' +
        'Usage: /delete &lt;debt_id&gt;\n\n' +
        'Or use /debts to view debts and click "Delete".',
      { parse_mode: 'HTML' },
    );
    return;
  }

  await confirmDelete(ctx, deps, debtId, false);
}

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

  await confirmDelete(ctx, deps, debtId, true);
}

async function confirmDelete(
  ctx: Context,
  deps: DeleteHandlerDeps,
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

  const message =
    '🗑 <b>Delete Debt?</b>\n\n' +
    formatter.formatDebtDocument(debt) +
    '\n\n<b>This action cannot be undone.</b>\n\n' +
    'Are you sure you want to delete this debt record?';

  const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await replyFn(message, {
    reply_markup: debtConfirmKeyboard('delete', debtId),
    parse_mode: 'HTML',
  });
}

export async function handleDeleteConfirm(
  ctx: Context,
  deps: DeleteHandlerDeps,
  debtId: string,
): Promise<void> {
  await ctx.answerCallbackQuery();

  const debt = await deps.db.debts.getById(debtId);

  if (!debt) {
    await ctx.editMessageText('❌ Debt not found. It may have been deleted.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  const success = await deps.db.debts.delete(debtId);

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
