import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { Context } from 'grammy';
import { DebtTelegramFormatter } from '../../../formatters/debt-telegram-formatter.ts';
import { debtListKeyboard, debtMenuKeyboard } from '../../keyboards.ts';

interface ListHandlerDeps {
  db: Database;
  agent: AgentPort;
}

const formatter = new DebtTelegramFormatter();

const userFilters = new Map<string, { status?: DebtStatus; direction?: DebtDirection }>();

export async function handleListDebts(ctx: Context, deps: ListHandlerDeps): Promise<void> {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  userFilters.delete(userId);
  await showDebtList(ctx, deps, false);
}

export async function handleListCallback(ctx: Context, deps: ListHandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (userId) {
    userFilters.delete(userId);
  }

  await showDebtList(ctx, deps, true);
}

async function showDebtList(ctx: Context, deps: ListHandlerDeps, isEdit: boolean): Promise<void> {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn('Unable to identify user.');
    return;
  }

  const filter = userFilters.get(userId) || {};
  const debts = await deps.db.debts.filter({
    status: filter.status,
    direction: filter.direction,
  });

  if (debts.length === 0) {
    const message = getFilterTitle(filter) + '\n\nNo debts found.';
    const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn(message, {
      reply_markup: debtListKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  const messages = formatter.formatDebtList(debts, getFilterTitle(filter));
  const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);

  await replyFn(messages[0], {
    reply_markup: debtListKeyboard(),
    parse_mode: 'HTML',
  });

  for (let i = 1; i < messages.length; i++) {
    await ctx.reply(messages[i], { parse_mode: 'HTML' });
  }
}

export async function handleFilterCallback(
  ctx: Context,
  deps: ListHandlerDeps,
  filterType: string,
): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.editMessageText('Unable to identify user.');
    return;
  }

  const currentFilter = userFilters.get(userId) || {};

  switch (filterType) {
    case 'all':
      userFilters.delete(userId);
      break;
    case 'pending':
      currentFilter.status = DebtStatus.PENDING;
      delete currentFilter.direction;
      userFilters.set(userId, currentFilter);
      break;
    case 'paid':
      currentFilter.status = DebtStatus.PAID;
      delete currentFilter.direction;
      userFilters.set(userId, currentFilter);
      break;
    case 'lent':
      currentFilter.direction = DebtDirection.LENT;
      delete currentFilter.status;
      userFilters.set(userId, currentFilter);
      break;
    case 'borrowed':
      currentFilter.direction = DebtDirection.BORROWED;
      delete currentFilter.status;
      userFilters.set(userId, currentFilter);
      break;
  }

  await showDebtList(ctx, deps, true);
}

export async function handleShowDebtDetails(
  ctx: Context,
  deps: ListHandlerDeps,
  debtId: string,
): Promise<void> {
  await ctx.answerCallbackQuery();

  const debt = await deps.db.debts.getById(debtId);

  if (!debt) {
    await ctx.editMessageText('❌ Debt not found. It may have been deleted.', {
      reply_markup: debtListKeyboard(),
      parse_mode: 'HTML',
    });
    return;
  }

  const message = formatter.formatDebtDocument(debt);

  await ctx.editMessageText(message, {
    reply_markup: formatter.debtItemKeyboard(debtId, debt.frontmatter.status),
    parse_mode: 'HTML',
  });
}

function getFilterTitle(filter: { status?: DebtStatus; direction?: DebtDirection }): string {
  if (!filter.status && !filter.direction) {
    return '📋 All Debts';
  }

  const parts: string[] = ['📋'];

  if (filter.status === DebtStatus.PENDING) {
    parts.push('Pending');
  } else if (filter.status === DebtStatus.PAID) {
    parts.push('Paid');
  }

  if (filter.direction === DebtDirection.LENT) {
    parts.push('Lent');
  } else if (filter.direction === DebtDirection.BORROWED) {
    parts.push('Borrowed');
  }

  parts.push('Debts');

  return parts.join(' ');
}

export async function handleDebtMenuCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('💵 <b>Debt Tracking</b>\n\nWhat would you like to do?', {
    reply_markup: debtMenuKeyboard(),
    parse_mode: 'HTML',
  });
}
