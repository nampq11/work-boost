import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { DebtDirection } from '@work-boost/data-schemas/debt.ts';
import { DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { Context } from 'grammy';
import { debtDirectionKeyboard, debtMenuKeyboard } from '../../keyboards.ts';

interface DebtHandlerDeps {
  db: Database;
  agent: AgentPort;
}

/**
 * Temporary storage for pending debt entries
 * In production, consider using a more robust session store
 */
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
 * Handle /debt command
 * Supports both natural language input and guided form
 */
export async function handleDebt(ctx: Context, deps: DebtHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id?.toString();
  const userId = ctx.from?.id.toString();

  if (!chatId || !userId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  // Get the message text after the command
  const messageText = ctx.message?.text;
  const inputText = messageText?.split(/\s+/).slice(1).join(' ').trim();

  // If there's input after the command, try to parse it as natural language
  if (inputText && inputText.length > 0) {
    await ctx.reply('🤖 Processing your debt entry...');

    const parsed = await deps.agent.parseDebtEntry(inputText);

    if (parsed) {
      // Create the debt entry
      await deps.db.createDebt({
        userId,
        direction: parsed.direction,
        amount: parsed.amount,
        currency: parsed.currency || 'USD',
        personName: parsed.person,
        reason: parsed.reason,
        status: DebtStatus.PENDING,
      });

      const directionText = parsed.direction === 'lent' ? 'lent to' : 'borrowed from';
      await ctx.reply(
        `✅ Debt recorded successfully!\n\n` +
          `You ${directionText} ${parsed.person}: ${parsed.currency || '$'}${parsed.amount.toFixed(
            2,
          )}` +
          (parsed.reason ? `\nReason: ${parsed.reason}` : ''),
        { reply_markup: debtMenuKeyboard() },
      );
    } else {
      await ctx.reply(
        '❌ Could not parse your debt entry. Please try again with a clearer format, e.g.:\n' +
          '• /debt lent 50 to John for lunch\n' +
          '• /debt borrowed 20 from Sarah',
        { reply_markup: debtDirectionKeyboard() },
      );
    }
  } else {
    // No input - show the guided form
    await ctx.reply('📝 <b>Record a Debt</b>\n\n' + 'Choose how you want to record this debt:', {
      reply_markup: debtDirectionKeyboard(),
      parse_mode: 'HTML',
    });
  }
}

/**
 * Handle callback to start recording debt with direction pre-selected
 */
export async function handleRecordDebt(ctx: Context, _deps: DebtHandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    '📝 <b>Record a Debt</b>\n\n' + 'Choose how you want to record this debt:',
    { reply_markup: debtDirectionKeyboard(), parse_mode: 'HTML' },
  );
}

/**
 * Handle direction selection callback
 */
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

  // Store pending debt with direction
  pendingDebts.set(userId, { userId, direction });

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
 * Handle text input for debt amount and person
 * This is called from the message handler when a pending debt exists
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

  // Try to parse with AI
  const parsed = await deps.agent.parseDebtEntry(inputText);

  if (parsed) {
    // Override direction with pending selection
    parsed.direction = pending.direction;

    await deps.db.createDebt({
      userId,
      direction: parsed.direction,
      amount: parsed.amount,
      currency: parsed.currency || 'USD',
      personName: parsed.person,
      reason: parsed.reason,
      status: DebtStatus.PENDING,
    });

    pendingDebts.delete(userId);

    const directionText = parsed.direction === 'lent' ? 'lent to' : 'borrowed from';
    await ctx.reply(
      `✅ Debt recorded successfully!\n\n` +
        `You ${directionText} ${parsed.person}: ${parsed.currency || '$'}${parsed.amount.toFixed(
          2,
        )}` +
        (parsed.reason ? `\nReason: ${parsed.reason}` : ''),
      { reply_markup: debtMenuKeyboard() },
    );
    return true;
  } else {
    await ctx.reply(
      '❌ Could not parse your input. Please use the format:\n' +
        ' &lt;amount&gt; &lt;person name&gt; [reason]\n\n' +
        'Example: 50 John for lunch\n\n' +
        'Or send /cancel to abort.',
    );
    return false;
  }
}

/**
 * Check if user has a pending debt entry
 */
export function hasPendingDebt(userId: string): boolean {
  return pendingDebts.has(userId);
}

/**
 * Clear pending debt entry
 */
export function clearPendingDebt(userId: string): void {
  pendingDebts.delete(userId);
}
