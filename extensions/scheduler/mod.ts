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
      const ctx = context;

      // Sender is built at fire time so jobs pick up messaging platforms that
      // were initialized after this extension.
      const createSender = () => createPlatformSender(ctx.db, ctx.messaging, ctx.logger);

      return [
        createDailySummaryJob(context),
        {
          name: 'weekly-debt-reminders',
          schedule: '0 9 * * 1',
          handler: () => sendWeeklyDebtReminders(ctx.db, ctx.logger, createSender()),
        },
        {
          name: 'monthly-debt-reminders',
          schedule: '0 9 1 * *',
          handler: () => sendMonthlyDebtReminders(ctx.db, ctx.logger, createSender()),
        },
      ];
    },
  };
}
