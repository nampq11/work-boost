import { assertEquals, assertThrows } from '@std/assert';
import { AI_DEFAULT_MODELS, resolveAIConfig } from '../src/config.ts';
import type { WorkspaceConfig } from '../src/config.ts';

Deno.test('resolveAIConfig - default behavior', () => {
  const workspaceConfig: Pick<WorkspaceConfig, 'ai'> = {};
  const result = resolveAIConfig(workspaceConfig);
  // Default provider must have a working login path (openai-codex OAuth), not
  // an API-key-only provider like google that dead-ends on a fresh install.
  assertEquals(result.provider, 'openai-codex');
  assertEquals(result.model, AI_DEFAULT_MODELS['openai-codex']);
});

Deno.test('resolveAIConfig - workspace config values', () => {
  const workspaceConfig: Pick<WorkspaceConfig, 'ai'> = {
    ai: { provider: 'zai', model: 'custom-zai-model' },
  };
  const result = resolveAIConfig(workspaceConfig);
  assertEquals(result.provider, 'zai');
  assertEquals(result.model, 'custom-zai-model');
});

Deno.test('resolveAIConfig - overrides take precedence', () => {
  const workspaceConfig: Pick<WorkspaceConfig, 'ai'> = {
    ai: { provider: 'zai', model: 'custom-zai-model' },
  };
  const overrides = { provider: 'openai-codex', model: 'override-model' };
  const result = resolveAIConfig(workspaceConfig, overrides);
  assertEquals(result.provider, 'openai-codex');
  assertEquals(result.model, 'override-model');
});

Deno.test('resolveAIConfig - empty string overrides are ignored', () => {
  const workspaceConfig: Pick<WorkspaceConfig, 'ai'> = {
    ai: { provider: 'zai', model: 'custom-zai-model' },
  };
  const overrides = { provider: ' ', model: '   ' };
  const result = resolveAIConfig(workspaceConfig, overrides);
  assertEquals(result.provider, 'zai');
  assertEquals(result.model, 'custom-zai-model');
});

Deno.test('resolveAIConfig - invalid provider in overrides throws', () => {
  const workspaceConfig: Pick<WorkspaceConfig, 'ai'> = {};
  const overrides = { provider: 'invalid-provider' };
  assertThrows(
    () => resolveAIConfig(workspaceConfig, overrides),
    Error,
    'Invalid AI provider "invalid-provider"',
  );
});

Deno.test('resolveAIConfig - missing model for openrouter throws', () => {
  const workspaceConfig: Pick<WorkspaceConfig, 'ai'> = {};
  const overrides = { provider: 'openrouter' };
  assertThrows(
    () => resolveAIConfig(workspaceConfig, overrides),
    Error,
    'AI model is required when provider "openrouter" is selected',
  );
});

Deno.test('resolveAIConfig - empty string model for openrouter throws', () => {
  const workspaceConfig: Pick<WorkspaceConfig, 'ai'> = {};
  const overrides = { provider: 'openrouter', model: '   ' };
  assertThrows(
    () => resolveAIConfig(workspaceConfig, overrides),
    Error,
    'AI model is required when provider "openrouter" is selected',
  );
});
