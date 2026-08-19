import { assertEquals, assertRejects } from '@std/assert';
import { Brain, createBrain } from '@work-boost/brain';
import type {
  ConfigManager,
  DailyWorkRepository,
  DataLayer,
  DebtRepository,
  WorkspaceFS,
} from '@work-boost/data-provider';
import type { WorkspaceConfig } from '@work-boost/data-schemas/config.ts';

function createFakeDataLayer(): DataLayer {
  const config: Partial<ConfigManager> = {
    load: () => Promise.resolve({ timezone: 'Asia/Ho_Chi_Minh' } as WorkspaceConfig),
    save: () => Promise.resolve(),
  };
  const fs: Partial<WorkspaceFS> = {
    init: () => Promise.resolve(),
    stat: () => Promise.resolve({ size: 0 }),
    listFiles: () => Promise.resolve([]),
    listDirs: () => Promise.resolve([]),
    readText: () => Promise.resolve(''),
    writeTextAtomic: () => Promise.resolve(),
    move: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    exists: () => Promise.resolve(false),
  };
  const emptyRepo: Partial<DebtRepository> = {};
  const emptyDaily: Partial<DailyWorkRepository> = {};
  return {
    fs: fs as WorkspaceFS,
    config: config as ConfigManager,
    dailyWork: emptyDaily as DailyWorkRepository,
    debts: emptyRepo as DebtRepository,
  };
}

Deno.test('createBrain returns a Brain instance', () => {
  const brain = createBrain({ apiKey: 'test-key', dataLayer: createFakeDataLayer() });
  assertEquals(brain instanceof Brain, true);
  brain.dispose();
});

Deno.test('Brain removeSession returns false for non-existent session', () => {
  const brain = createBrain({ apiKey: 'test-key', dataLayer: createFakeDataLayer() });
  assertEquals(brain.removeSession('nonexistent'), false);
  brain.dispose();
});

Deno.test('Brain removeSession returns true after a session has been created', async () => {
  const brain = createBrain({ apiKey: 'test-key', dataLayer: createFakeDataLayer() });
  // First stream creates the session; we expect it to reject because the fake
  // API key cannot reach the model provider, but the session entry is still
  // registered by getOrCreate before prompt is called.
  await brain.stream('hello', { sessionId: 'chat-1' }).catch(() => {});
  assertEquals(brain.removeSession('chat-1'), true);
  brain.dispose();
});

Deno.test('Brain stream throws on invalid API key (error is propagated)', async () => {
  const brain = createBrain({ apiKey: 'invalid-key', dataLayer: createFakeDataLayer() });
  await assertRejects(() => brain.stream('hello', { sessionId: 'err-test' }), Error);
  brain.dispose();
});

Deno.test('Brain stream throws when no API key is provided', async () => {
  const brain = createBrain({ apiKey: '', dataLayer: createFakeDataLayer() });
  await assertRejects(() => brain.stream('hello', { sessionId: 'no-key' }), Error);
  brain.dispose();
});

Deno.test('Brain dispose stops background timers without throwing', () => {
  const brain = createBrain({ apiKey: 'test-key', dataLayer: createFakeDataLayer() });
  brain.dispose(); // should not throw
});
