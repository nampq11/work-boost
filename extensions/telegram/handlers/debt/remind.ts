import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Context } from 'grammy';
import { debtMenuKeyboard, debtReminderKeyboard } from '../../keyboards.ts';

interface RemindHandlerDeps {
  db: Database;
  agent: AgentPort;
}

function getCurrentFrequencyText(
  frequency: string,
  weeklyDay?: number,
  monthlyDay?: number,
): string {
  switch (frequency) {
    case 'weekly': {
      const day = weeklyDay || 1;
      return `Weekly (every ${day}${getOrdinal(day)} day of the week)`;
    }
    case 'monthly': {
      const day = monthlyDay || 1;
      return `Monthly (on the ${day}${getOrdinal(day)})`;
    }
    default:
      return 'Disabled';
  }
}

function getFrequencyLabel(frequency: 'weekly' | 'monthly' | 'never'): string {
  switch (frequency) {
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'never':
      return 'Never';
  }
}

function getReminderVerb(frequency: 'weekly' | 'monthly' | 'never'): string {
  return frequency === 'never' ? 'not receive' : 'receive';
}

export async function handleRemind(ctx: Context, deps: RemindHandlerDeps): Promise<void> {
  await showReminderSettings(ctx, deps, false);
}

export async function handleRemindCallback(ctx: Context, deps: RemindHandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  await showReminderSettings(ctx, deps, true);
}

async function showReminderSettings(
  ctx: Context,
  deps: RemindHandlerDeps,
  isEdit: boolean,
): Promise<void> {
  const config = await deps.db.config.load();
  const settings = config.debtReminder;

  const currentFrequency = settings.frequency || 'never';
  const enabled = settings.enabled || false;

  let message = '⏰ <b>Debt Reminders</b>\n\n';

  if (enabled) {
    const frequencyText = getCurrentFrequencyText(
      currentFrequency,
      settings.weeklyDay,
      settings.monthlyDay,
    );

    message += `Current setting: <b>${frequencyText}</b>\n\n`;
    message += `You'll receive a summary of your unpaid debts.`;
  } else {
    message += 'Debt reminders are currently disabled.\n\n';
    message += 'Enable reminders to get periodic summaries of your unpaid debts.';
  }

  message += '\n\nChoose how often you want to receive reminders:';

  const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await replyFn(message, {
    reply_markup: debtReminderKeyboard(currentFrequency),
    parse_mode: 'HTML',
  });
}

export async function handleSetReminderFrequency(
  ctx: Context,
  deps: RemindHandlerDeps,
  frequency: 'weekly' | 'monthly' | 'never',
): Promise<void> {
  await ctx.answerCallbackQuery();

  const config = await deps.db.config.load();

  config.debtReminder = {
    ...config.debtReminder,
    enabled: frequency !== 'never',
    frequency: frequency as 'weekly' | 'monthly' | 'never',
  };

  await deps.db.config.save(config);

  const frequencyText = getFrequencyLabel(frequency);
  const frequencySuffix = frequency === 'never' ? '' : ` ${frequencyText.toLowerCase()}`;

  await ctx.editMessageText(
    `✅ Reminder settings updated!\n\n` +
      `You will ${getReminderVerb(frequency)} debt reminders${frequencySuffix}.`,
    { reply_markup: debtMenuKeyboard(), parse_mode: 'HTML' },
  );
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
