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
    stat: () => Promise.resolve({ size: 0, modifiedAt: '' }),
    listFiles: () => Promise.resolve([]),
    listDirs: () => Promise.resolve([]),
    readText: () => Promise.resolve(''),
    writeTextAtomic: () => Promise.resolve(),
    writeTextIfAbsent: () => Promise.resolve(true),
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
  const brain = createBrain({ dataLayer: createFakeDataLayer() });
  assertEquals(brain instanceof Brain, true);
  brain.dispose();
});

Deno.test('Brain removeSession returns false for non-existent session', () => {
  const brain = createBrain({ dataLayer: createFakeDataLayer() });
  assertEquals(brain.removeSession('nonexistent'), false);
  brain.dispose();
});

Deno.test('Brain removeSession returns true after a session has been created', async () => {
  const brain = createBrain({ dataLayer: createFakeDataLayer() });
  // The session entry is registered before the provider request runs.
  await brain.stream('hello', { sessionId: 'chat-1' }).catch(() => {});
  assertEquals(brain.removeSession('chat-1'), true);
  brain.dispose();
});

Deno.test('Brain stream throws when the configured provider has no credentials', async () => {
  const brain = createBrain({ dataLayer: createFakeDataLayer() });
  await assertRejects(() => brain.stream('hello', { sessionId: 'err-test' }), Error);
  brain.dispose();
});

Deno.test('Brain stream propagates provider failures as errors', async () => {
  const brain = createBrain({ dataLayer: createFakeDataLayer() });
  await assertRejects(() => brain.stream('hello', { sessionId: 'no-key' }), Error);
  brain.dispose();
});

Deno.test('Brain dispose stops background timers without throwing', () => {
  const brain = createBrain({ dataLayer: createFakeDataLayer() });
  brain.dispose();
});
