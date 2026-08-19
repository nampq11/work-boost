import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { DebtDirection } from '@work-boost/data-schemas/debt.ts';
import type { Context } from 'grammy';
import { debtDirectionKeyboard, debtMenuKeyboard } from '../../keyboards.ts';

interface DebtHandlerDeps {
  db: Database;
  agent: AgentPort;
}

const pendingDebts = new Map<
  string,
  {
    userId: string;
    direction?: DebtDirection;
    amount?: number;
    person?: string;
    reason?: string;
  }
>();

/**
 * Handle /debt command.
 * With natural-language input, delegates parsing to the Brain agent via stream().
 * Without input, shows the guided direction-selection form.
 */
export async function handleDebt(ctx: Context, deps: DebtHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id?.toString();
  const userId = ctx.from?.id.toString();

  if (!chatId || !userId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  const messageText = ctx.message?.text;
  const inputText = messageText?.split(/\s+/).slice(1).join(' ').trim();

  if (inputText && inputText.length > 0) {
    await ctx.reply('🤖 Processing...');

    const sessionId = `telegram_${userId}`;
    const response = await deps.agent.stream(inputText, { sessionId });

    await ctx.reply(response || 'Done.', {
      reply_markup: debtMenuKeyboard(),
      parse_mode: 'HTML',
    });
  } else {
    await ctx.reply('📝 <b>Record a Debt</b>\n\nChoose how you want to record this debt:', {
      reply_markup: debtDirectionKeyboard(),
      parse_mode: 'HTML',
    });
  }
}

export async function handleRecordDebt(ctx: Context, _deps: DebtHandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('📝 <b>Record a Debt</b>\n\nChoose how you want to record this debt:', {
    reply_markup: debtDirectionKeyboard(),
    parse_mode: 'HTML',
  });
}

export async function handleDirectionSelect(
  ctx: Context,
  _deps: DebtHandlerDeps,
  direction: 'lent' | 'borrowed',
): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply('Unable to identify user.');
    return;
  }

  pendingDebts.set(userId, { userId, direction: direction as DebtDirection });

  const directionText = direction === 'lent' ? 'lent to' : 'borrowed from';
  await ctx.editMessageText(
    `💰 <b>Record Debt - ${direction === 'lent' ? 'Lent' : 'Borrowed'} Money</b>\n\n` +
      `You're recording money you ${directionText} someone.\n\n` +
      `Please enter the amount and person name.\n\n` +
      `<b>Format:</b> &lt;amount&gt; &lt;person name&gt; [reason]\n` +
      `<b>Example:</b> 50 John for lunch\n\n` +
      `Or send /cancel to abort.`,
    { parse_mode: 'HTML' },
  );
}

/**
 * Handle text input for debt entry with a pre-selected direction.
 * Delegates to the Brain agent, prepending the direction context so the
 * agent normalizes the input correctly.
 */
export async function handleDebtInput(
  ctx: Context,
  deps: DebtHandlerDeps,
  inputText: string,
): Promise<boolean> {
  const userId = ctx.from?.id.toString();
  if (!userId) return false;

  const pending = pendingDebts.get(userId);
  if (!pending || !pending.direction) return false;

  await ctx.reply('🤖 Processing...');

  const directionText = pending.direction === 'lent' ? 'cho vay' : 'vay';
  const contextMessage = `Hướng nợ: ${directionText}. Nhập: ${inputText}`;
  const sessionId = `telegram_${userId}`;
  pendingDebts.delete(userId);

  let response: string;
  try {
    response = await deps.agent.stream(contextMessage, { sessionId });
  } catch {
    await ctx.reply('Sorry, I could not record that debt. Please try again.');
    return true;
  }

  await ctx.reply(response || 'Done.', {
    reply_markup: debtMenuKeyboard(),
    parse_mode: 'HTML',
  });
  return true;
}

export function hasPendingDebt(userId: string): boolean {
  return pendingDebts.has(userId);
}

export function clearPendingDebt(userId: string): void {
  pendingDebts.delete(userId);
}
