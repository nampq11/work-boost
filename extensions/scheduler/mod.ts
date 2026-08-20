import type { WorkBoostExtension } from '../types.ts';
import { createDailySummaryJob, createPlatformSender } from './daily-job.ts';
import { sendMonthlyDebtReminders, sendWeeklyDebtReminders } from './debt-reminder-job.ts';

export function schedulerExtension(): WorkBoostExtension {
  let context: Parameters<NonNullable<WorkBoostExtension['init']>>[0] | undefined;

  return {
    name: 'scheduler',
    version: '1.0.0',

    init(ctx) {
      context = ctx;
    },

    registerJobs() {
      if (!context) return [];
      const sendReminder = createPlatformSender(context.db, context.messaging);

      return [
        createDailySummaryJob(context),
        {
          name: 'weekly-debt-reminders',
          schedule: '0 9 * * 1',
          handler: () => sendWeeklyDebtReminders(context!.db, sendReminder),
        },
        {
          name: 'monthly-debt-reminders',
          schedule: '0 9 1 * *',
          handler: () => sendMonthlyDebtReminders(context!.db, sendReminder),
        },
      ];
    },
  };
}
