/**
 * Debt reminder cron job
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */

import type { Database } from '@work-boost/data-provider/database.ts';
import { DebtTelegramFormatter } from '../formatters/debt-telegram-formatter.ts';

const formatter = new DebtTelegramFormatter();

/**
 * Send weekly debt reminders
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */
export async function sendWeeklyDebtReminders(
  db: Database,
  sendFn: (message: string) => Promise<void>,
): Promise<void> {
  const settings = await db.getAllDebtReminderUsers();

  for (const setting of settings) {
    if (setting.frequency !== 'weekly') continue;

    // Check if today is the configured day (default: Monday = 1)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const targetDay = setting.weeklyDay || 1;

    if (dayOfWeek !== targetDay) continue;

    // Check if we already sent a reminder this week
    const lastSent = setting.lastReminderSentAt;
    if (lastSent) {
      const daysSinceLastSent = Math.floor(
        (today.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceLastSent < 7) continue;
    }

    await sendDebtReminder(db, sendFn);
  }
}

/**
 * Send monthly debt reminders
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */
export async function sendMonthlyDebtReminders(
  db: Database,
  sendFn: (message: string) => Promise<void>,
): Promise<void> {
  const settings = await db.getAllDebtReminderUsers();

  for (const setting of settings) {
    if (setting.frequency !== 'monthly') continue;

    // Check if today is the configured day
    const today = new Date();
    const dayOfMonth = today.getDate();
    const targetDay = Math.min(setting.monthlyDay || 1, 28); // Cap at 28 to handle all months

    if (dayOfMonth !== targetDay) continue;

    // Check if we already sent a reminder this month
    const lastSent = setting.lastReminderSentAt;
    if (lastSent) {
      const daysSinceLastSent = Math.floor(
        (today.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceLastSent < 25) continue; // At least 25 days since last reminder
    }

    await sendDebtReminder(db, sendFn);
  }
}

/**
 * Send debt reminder to workspace user
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */
async function sendDebtReminder(
  db: Database,
  sendFn: (message: string) => Promise<void>,
): Promise<void> {
  // Get unpaid debts for workspace user
  const unpaidDebts = await db.getUnpaidDebtsByUserId('workspace-user');

  if (unpaidDebts.length === 0) {
    return; // No unpaid debts, skip reminder
  }

  // Get summary for workspace user
  const summary = await db.getDebtSummary('workspace-user');

  // Build message
  let message = '⏰ <b>Debt Reminder</b>\n\n';
  message += "Here's a summary of your unpaid debts:\n\n";

  // Add pending lent (people who owe you)
  if (summary.pendingLentCount > 0) {
    message += `💰 <b>Owed to you:</b> ${formatter.formatCurrency(summary.totalLent, 'USD')}\n`;
    message += `   (${summary.pendingLentCount} debt${summary.pendingLentCount > 1 ? 's' : ''})\n\n`;
  }

  // Add pending borrowed (people you owe)
  if (summary.pendingBorrowedCount > 0) {
    message += `📥 <b>You owe:</b> ${formatter.formatCurrency(summary.totalBorrowed, 'USD')}\n`;
    message += `   (${summary.pendingBorrowedCount} debt${summary.pendingBorrowedCount > 1 ? 's' : ''})\n\n`;
  }

  message += 'Use /debts to view and manage your debts.';

  // Send the reminder
  try {
    await sendFn(message);
    await db.updateDebtReminderLastSent('workspace-user');
  } catch (error) {
    console.error('Failed to send debt reminder:', error);
  }
}

/**
 * Setup cron jobs for debt reminders
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */
export function setupDebtReminderCron(
  db: Database,
  sendFn: (message: string) => Promise<void>,
): void {
  // Weekly reminder - every Monday at 9 AM
  Deno.cron('weekly-debt-reminders', '0 9 * * 1', async () => {
    console.log('Running weekly debt reminders...');
    await sendWeeklyDebtReminders(db, sendFn);
    console.log('Weekly debt reminders completed.');
  });

  // Monthly reminder - on the 1st at 9 AM
  Deno.cron('monthly-debt-reminders', '0 9 1 * *', async () => {
    console.log('Running monthly debt reminders...');
    await sendMonthlyDebtReminders(db, sendFn);
    console.log('Monthly debt reminders completed.');
  });

  console.log('Debt reminder cron jobs registered.');
}

/**
 * Manually trigger debt reminders for testing
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */
export async function triggerAllDebtReminders(
  db: Database,
  sendFn: (message: string) => Promise<void>,
): Promise<void> {
  const settings = await db.getAllDebtReminderUsers();

  for (const setting of settings) {
    await sendDebtReminder(db, sendFn);
  }
}
