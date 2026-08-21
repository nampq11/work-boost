import { z } from 'zod';

export const AIProviderSchema = z.enum(['zai', 'openai-codex', 'openrouter', 'google']);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const AI_DEFAULT_MODELS: Record<AIProvider, string | undefined> = {
  zai: 'glm-5.2',
  'openai-codex': 'gpt-5.4-mini',
  google: 'gemini-2.5-flash',
  openrouter: undefined,
};

export const AIConfigSchema = z.object({
  provider: AIProviderSchema,
  model: z.string().trim().min(1).optional(),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

export interface AIConfigOverrides {
  provider?: string;
  model?: string;
}

export interface ResolvedAIConfig {
  provider: AIProvider;
  model: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Resolve environment overrides without persisting secrets or process settings. */
export function resolveAIConfig(
  workspaceConfig: Pick<WorkspaceConfig, 'ai'>,
  overrides: AIConfigOverrides = {},
): ResolvedAIConfig {
  const providerValue = nonEmpty(overrides.provider) ?? workspaceConfig.ai?.provider ?? 'google';
  const providerResult = AIProviderSchema.safeParse(providerValue);
  if (!providerResult.success) {
    throw new Error(
      `Invalid AI provider "${providerValue}". Supported providers: ${AIProviderSchema.options.join(', ')}`,
    );
  }

  const provider = providerResult.data;
  const model =
    nonEmpty(overrides.model) ?? workspaceConfig.ai?.model ?? AI_DEFAULT_MODELS[provider];
  if (!model) {
    throw new Error(`AI model is required when provider "${provider}" is selected`);
  }

  return { provider, model };
}

export const WorkspaceConfigSchema = z.object({
  version: z.literal(1).default(1),
  workspaceName: z.string().default('My WorkBoost'),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  createdAt: z.string().datetime(),
  ai: AIConfigSchema.optional(),
  updatedAt: z.string().datetime(),

  // Platform integration settings (replaces Subscription in KV)
  platforms: z
    .object({
      slack: z
        .object({
          enabled: z.boolean().default(false),
          channelId: z.string().optional(),
          userId: z.string().optional(),
          lastSentAt: z.string().datetime().nullable().default(null),
        })
        .default({ enabled: false, lastSentAt: null }),
      telegram: z
        .object({
          enabled: z.boolean().default(false),
          chatId: z.string().optional(),
        })
        .default({ enabled: false }),
    })
    .default({ slack: { enabled: false, lastSentAt: null }, telegram: { enabled: false } }),

  // Automatic debt reminder settings
  debtReminder: z
    .object({
      enabled: z.boolean().default(false),
      frequency: z.enum(['weekly', 'monthly', 'never']).default('weekly'),
      weeklyDay: z.number().min(1).max(7).default(1), // Monday
      monthlyDay: z.number().min(1).max(28).default(1), // 1st of month
      reminderHour: z.number().min(0).max(23).default(9),
      lastSentAt: z.string().datetime().nullable().default(null),
    })
    .default({
      enabled: false,
      frequency: 'weekly',
      weeklyDay: 1,
      monthlyDay: 1,
      reminderHour: 9,
      lastSentAt: null,
    }),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
