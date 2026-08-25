import { assertEquals, assertThrows } from '@std/assert';
import { createBrain } from '@work-boost/brain';
import type {
  ConfigManager,
  DailyWorkRepository,
  DataLayer,
  DebtRepository,
  WorkspaceFS,
} from '@work-boost/data-provider';
import {
  AIConfigSchema,
  AI_DEFAULT_MODELS,
  WorkspaceConfigSchema,
  resolveAIConfig,
} from '@work-boost/data-schemas/config.ts';

function createFakeDataLayer(): DataLayer {
  return {
    config: {
      load: () => Promise.resolve({} as never),
      save: () => Promise.resolve(),
    } as ConfigManager,
    fs: {} as WorkspaceFS,
    dailyWork: {} as DailyWorkRepository,
    debts: {} as DebtRepository,
  };
}

Deno.test('old workspace config remains compatible and resolves Google defaults', () => {
  const config = WorkspaceConfigSchema.parse({
    version: 1,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
  });

  assertEquals(config.ai, undefined);
  assertEquals(resolveAIConfig(config), {
    provider: 'google',
    model: AI_DEFAULT_MODELS.google,
  });
});

Deno.test('environment AI settings override workspace settings', () => {
  const config = WorkspaceConfigSchema.parse({
    version: 1,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
  });

  assertEquals(resolveAIConfig(config, { provider: 'zai', model: 'glm-5.2' }), {
    provider: 'zai',
    model: 'glm-5.2',
  });
});

Deno.test('OpenRouter requires an explicit model', () => {
  assertThrows(
    () => resolveAIConfig({ ai: { provider: 'openrouter' } }),
    Error,
    'AI model is required',
  );
  assertEquals(
    AIConfigSchema.parse({ provider: 'openrouter', model: 'openai/gpt-4o' }).provider,
    'openrouter',
  );
});

Deno.test('Brain selects exactly the configured provider and model', () => {
  const brain = createBrain({
    dataLayer: createFakeDataLayer(),
    ai: { provider: 'zai', model: 'glm-5.2' },
  });

  assertEquals(brain.ai, { provider: 'zai', model: 'glm-5.2' });
  brain.dispose();
});

Deno.test('Brain can construct each supported provider without a network request', () => {
  const configurations = [
    { provider: 'zai' as const, model: 'glm-5.2' },
    { provider: 'openai-codex' as const, model: 'gpt-5.4-mini' },
    { provider: 'openrouter' as const, model: 'openai/gpt-4o-mini' },
    { provider: 'google' as const, model: 'gemini-2.5-flash' },
  ];

  for (const ai of configurations) {
    const brain = createBrain({ dataLayer: createFakeDataLayer(), ai });
    assertEquals(brain.ai, ai);
    brain.dispose();
  }
});

Deno.test('Brain rejects an unknown model during construction', () => {
  assertThrows(
    () =>
      createBrain({
        dataLayer: createFakeDataLayer(),
        ai: { provider: 'google', model: 'not-a-real-model' },
      }),
    Error,
    'Unknown AI model',
  );
});
