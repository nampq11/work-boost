import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Context } from 'grammy';
import { DEBT_CONVERSATION_HINT } from './debt.ts';
import { handleRemindCallback, handleSetReminderFrequency } from './remind.ts';

interface CallbackHandlerDeps {
  db: Database;
  agent: AgentPort;
}

/**
 * Main callback handler for debt-related actions.
 * Debt management is conversation-first: any legacy button other than
 * reminder settings nudges the user toward chatting with the agent.
 */
export async function handleDebtCallback(ctx: Context, deps: CallbackHandlerDeps): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) return;

  // Format: action:debt:<action>[:params...]
  const parts = callbackData.split(':');

  if (parts.length < 3 || parts[0] !== 'action' || parts[1] !== 'debt') {
    return;
  }

  const action = parts[2];
  const params = parts.slice(3);

  if (action === 'remind') {
    const frequency = params[0];
    if (!frequency) return handleRemindCallback(ctx, deps);
    if (frequency === 'weekly' || frequency === 'monthly' || frequency === 'never') {
      return handleSetReminderFrequency(ctx, deps, frequency);
    }
    await ctx.answerCallbackQuery({ text: 'Invalid action' });
    return;
  }

  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageText(DEBT_CONVERSATION_HINT, { parse_mode: 'HTML' });
  } catch {
    await ctx.reply(DEBT_CONVERSATION_HINT, { parse_mode: 'HTML' });
  }
}
