import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import { AuthServiceError, createBrain } from '@work-boost/brain';
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

Deno.test('old workspace config remains compatible and resolves the default provider', () => {
  const config = WorkspaceConfigSchema.parse({
    version: 1,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
  });

  assertEquals(config.ai, undefined);
  assertEquals(resolveAIConfig(config), {
    provider: 'openai-codex',
    model: AI_DEFAULT_MODELS['openai-codex'],
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

Deno.test('Brain.setAIConfig switches the active provider and persists the choice', async () => {
  const brain = createBrain({
    dataLayer: createFakeDataLayer(),
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
  });
  try {
    const status = await brain.setAIConfig({ provider: 'openai-codex' });
    assertEquals(brain.ai, { provider: 'openai-codex', model: 'gpt-5.4-mini' });
    assertEquals(status.provider, 'openai-codex');
    assertEquals(status.model, 'gpt-5.4-mini');
  } finally {
    brain.dispose();
  }
});

Deno.test('Brain.setAIConfig rejects unknown models', async () => {
  const brain = createBrain({
    dataLayer: createFakeDataLayer(),
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
  });
  try {
    const error = await assertRejects(
      () => brain.setAIConfig({ provider: 'google', model: 'not-a-real-model' }),
      AuthServiceError,
      'Unknown AI model',
    );
    assertEquals(error.code, 'AI_CONFIG_UNKNOWN_MODEL');
    assertEquals(error.status, 400);
  } finally {
    brain.dispose();
  }
});

Deno.test('Brain.setAIConfig requires a model for openrouter', async () => {
  const brain = createBrain({
    dataLayer: createFakeDataLayer(),
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
  });
  try {
    const error = await assertRejects(
      () => brain.setAIConfig({ provider: 'openrouter' }),
      AuthServiceError,
      'AI model is required when provider "openrouter" is selected',
    );
    assertEquals(error.code, 'AI_CONFIG_MODEL_REQUIRED');
    assertEquals(error.status, 400);
  } finally {
    brain.dispose();
  }
});

Deno.test('Brain.setAIConfig rejects invalid providers with a typed validation error', async () => {
  const brain = createBrain({
    dataLayer: createFakeDataLayer(),
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
  });
  try {
    const error = await assertRejects(
      () => brain.setAIConfig({ provider: 'not-a-provider' }),
      AuthServiceError,
      'Invalid AI provider',
    );
    assertEquals(error.code, 'AI_CONFIG_INVALID_PROVIDER');
    assertEquals(error.status, 400);
  } finally {
    brain.dispose();
  }
});

Deno.test('Brain.setAIConfig propagates storage failures instead of masking them', async () => {
  const dataLayer = createFakeDataLayer();
  dataLayer.config.save = () => Promise.reject(new Error('config write failed'));
  const brain = createBrain({
    dataLayer,
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
  });
  try {
    const error = await assertRejects(
      () => brain.setAIConfig({ provider: 'openai-codex' }),
      Error,
      'config write failed',
    );
    assertEquals(error instanceof AuthServiceError, false);
  } finally {
    brain.dispose();
  }
});
