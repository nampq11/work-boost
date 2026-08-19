import { z } from 'zod';

export const WorkspaceConfigSchema = z.object({
  version: z.literal(1).default(1),
  workspaceName: z.string().default('My WorkBoost'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  // Platform integration settings (replaces Subscription in KV)
  platforms: z.object({
    slack: z.object({
      enabled: z.boolean().default(false),
      channelId: z.string().optional(),
      userId: z.string().optional(),
    }).default({ enabled: false }),
    telegram: z.object({
      enabled: z.boolean().default(false),
      chatId: z.string().optional(),
    }).default({ enabled: false }),
  }).default({ slack: { enabled: false }, telegram: { enabled: false } }),

  // Automatic debt reminder settings
  debtReminder: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['weekly', 'monthly', 'never']).default('weekly'),
    weeklyDay: z.number().min(1).max(7).default(1), // Monday
    monthlyDay: z.number().min(1).max(28).default(1), // 1st of month
    reminderHour: z.number().min(0).max(23).default(9),
    lastSentAt: z.string().datetime().nullable().default(null),
  }).default({
    enabled: false,
    frequency: 'weekly',
    weeklyDay: 1,
    monthlyDay: 1,
    reminderHour: 9,
    lastSentAt: null,
  }),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
