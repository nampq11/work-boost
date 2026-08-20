import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Context } from 'grammy';
import { DebtTelegramFormatter } from '../../../formatters/debt-telegram-formatter.ts';
import { debtMenuKeyboard } from '../../keyboards.ts';

interface RemindHandlerDeps {
  db: Database;
  agent: AgentPort;
}

const formatter = new DebtTelegramFormatter();

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
    const frequencyText =
      currentFrequency === 'weekly'
        ? `Weekly (every ${settings.weeklyDay || 1}${getOrdinal(
            settings.weeklyDay || 1,
          )} day of the week)`
        : currentFrequency === 'monthly'
          ? `Monthly (on the ${settings.monthlyDay || 1}${getOrdinal(settings.monthlyDay || 1)})`
          : 'Disabled';

    message += `Current setting: <b>${frequencyText}</b>\n\n`;
    message += `You'll receive a summary of your unpaid debts.`;
  } else {
    message += 'Debt reminders are currently disabled.\n\n';
    message += 'Enable reminders to get periodic summaries of your unpaid debts.';
  }

  message += '\n\nChoose how often you want to receive reminders:';

  const replyFn = isEdit ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await replyFn(message, {
    reply_markup: formatter.remindKeyboard(currentFrequency),
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

  const frequencyText =
    frequency === 'weekly' ? 'Weekly' : frequency === 'monthly' ? 'Monthly' : 'Never';

  await ctx.editMessageText(
    `✅ Reminder settings updated!\n\n` +
      `You will ${
        frequency === 'never' ? 'not receive' : 'receive'
      } debt reminders ${frequencyText.toLowerCase()}.`,
    { reply_markup: debtMenuKeyboard(), parse_mode: 'HTML' },
  );
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
