import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Context } from 'grammy';

interface DebtHandlerDeps {
  db: Database;
  agent: AgentPort;
}

/**
 * Reply with HTML parse mode, falling back to plain text if Telegram rejects
 * the agent's free-form output as malformed HTML.
 */
async function safeReplyHtml(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text);
  }
}

export const DEBT_CONVERSATION_HINT =
  '💬 <b>Track debts by chatting</b>\n\n' +
  'Just tell me in plain language, for example:\n' +
  '• <i>lent Hoa 200k for lunch</i>\n' +
  '• <i>what does Hoa owe me?</i>\n' +
  '• <i>mark the lunch debt as paid</i>';

/**
 * Handle /debt command.
 * With natural-language input, delegates parsing to the Brain agent via stream().
 * Without input, nudges the user toward conversation instead of a guided form.
 */
export async function handleDebt(ctx: Context, deps: DebtHandlerDeps): Promise<void> {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  const messageText = ctx.message?.text;
  const inputText = messageText?.split(/\s+/).slice(1).join(' ').trim();

  if (inputText && inputText.length > 0) {
    await ctx.reply('🤖 Processing...');

    const sessionId = `telegram_${userId}`;
    const response = await deps.agent.stream(inputText, {
      sessionId,
      signal: AbortSignal.timeout(60_000),
    });

    await safeReplyHtml(ctx, response || 'Done.');
  } else {
    await ctx.reply(DEBT_CONVERSATION_HINT, { parse_mode: 'HTML' });
  }
}
