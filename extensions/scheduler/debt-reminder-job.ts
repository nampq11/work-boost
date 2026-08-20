/**
 * Debt reminder cron job
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */

import { type Database, SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';
import { formatCurrency } from '../formatters/debt-formatting.ts';

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
  const unpaidDebts = await db.getUnpaidDebtsByUserId(SINGLE_USER_ID);

  if (unpaidDebts.length === 0) {
    return; // No unpaid debts, skip reminder
  }

  // Get summary for workspace user
  const summary = await db.getDebtSummary(SINGLE_USER_ID);

  // Build message
  let message = '⏰ <b>Debt Reminder</b>\n\n';
  message += "Here's a summary of your unpaid debts:\n\n";

  // Add pending lent (people who owe you)
  if (summary.pendingLentCount > 0) {
    message += '💰 <b>Owed to you:</b>\n';
    for (const [currency, totals] of Object.entries(summary.currencies)) {
      if (totals.lent > 0) {
        message += `   ${formatCurrency(totals.lent, currency)}\n`;
      }
    }
    message += `   (${summary.pendingLentCount} debt${
      summary.pendingLentCount > 1 ? 's' : ''
    })\n\n`;
  }

  // Add pending borrowed (people you owe)
  if (summary.pendingBorrowedCount > 0) {
    message += '📥 <b>You owe:</b>\n';
    for (const [currency, totals] of Object.entries(summary.currencies)) {
      if (totals.borrowed > 0) {
        message += `   ${formatCurrency(totals.borrowed, currency)}\n`;
      }
    }
    message += `   (${summary.pendingBorrowedCount} debt${
      summary.pendingBorrowedCount > 1 ? 's' : ''
    })\n\n`;
  }

  message += 'Use /debts to view and manage your debts.';

  // Send the reminder
  try {
    await sendFn(message);
  } catch (error) {
    console.error('Failed to send debt reminder:', error);
    throw error;
  }

  try {
    await db.updateDebtReminderLastSent(SINGLE_USER_ID);
  } catch (error) {
    console.error('Sent debt reminder but failed to record the timestamp:', error);
  }
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

  if (settings.length === 0) return;
  await sendDebtReminder(db, sendFn);
}
