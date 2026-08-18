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

/**
 * Handle /remind command - configure debt reminders
 */
export async function handleRemind(ctx: Context, deps: RemindHandlerDeps): Promise<void> {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  await showReminderSettings(ctx, deps, userId, false);
}

/**
 * Handle reminder callback from debt menu
 */
export async function handleRemindCallback(ctx: Context, deps: RemindHandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.editMessageText('Unable to identify user.');
    return;
  }

  await showReminderSettings(ctx, deps, userId, true);
}

/**
 * Show reminder settings
 */
async function showReminderSettings(
  ctx: Context,
  deps: RemindHandlerDeps,
  userId: string,
  isEdit: boolean,
): Promise<void> {
  // Get current settings
  const settings = await deps.db.getDebtReminderSettings(userId);

  const currentFrequency = settings?.frequency || 'never';
  const enabled = settings?.enabled || false;

  let message = '⏰ <b>Debt Reminders</b>\n\n';

  if (enabled) {
    const frequencyText =
      currentFrequency === 'weekly'
        ? `Weekly (every ${settings?.weeklyDay ? settings.weeklyDay : 1}${getOrdinal(
            settings?.weeklyDay || 1,
          )} day of the week)`
        : currentFrequency === 'monthly'
          ? `Monthly (on the ${settings?.monthlyDay ? settings.monthlyDay : 1}${getOrdinal(
              settings?.monthlyDay || 1,
            )})`
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

/**
 * Handle reminder frequency selection
 */
export async function handleSetReminderFrequency(
  ctx: Context,
  deps: RemindHandlerDeps,
  frequency: 'weekly' | 'monthly' | 'never',
): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.editMessageText('Unable to identify user.');
    return;
  }

  // Get existing settings
  const existing = await deps.db.getDebtReminderSettings(userId);

  const enabled = frequency !== 'never';

  await deps.db.upsertDebtReminderSettings({
    userId,
    enabled,
    frequency,
    weeklyDay: existing?.weeklyDay || 1, // Monday
    monthlyDay: existing?.monthlyDay || 1, // 1st of month
    reminderHour: 9, // 9 AM
  });

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

/**
 * Convert number to ordinal (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
