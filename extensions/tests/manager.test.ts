import { assertEquals } from '@std/assert';
import { ExtensionManager } from '../manager.ts';
import type { ExtensionContext, WorkBoostExtension } from '../types.ts';

function createContext(): ExtensionContext {
  const logger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
  } as unknown as ExtensionContext['logger'];

  return {
    dataLayer: {} as ExtensionContext['dataLayer'],
    db: {} as ExtensionContext['db'],
    agent: {} as ExtensionContext['agent'],
    logger,
    env: { get: () => undefined },
  };
}

Deno.test('ExtensionManager initializes extensions, routes requests, and registers jobs', async () => {
  const manager = new ExtensionManager(createContext());
  let initialized = false;
  let disposed = false;

  const extension: WorkBoostExtension = {
    name: 'test-extension',
    init() {
      initialized = true;
    },
    registerRoutes(router) {
      router.get('/plugin-health', async () => new Response('ok'));
    },
    registerJobs() {
      return [{ name: 'test-job', schedule: '* * * * *', handler: async () => {} }];
    },
    dispose() {
      disposed = true;
    },
  };

  manager.use(extension);
  await manager.initAll();

  const response = await manager.handleRequest(new Request('http://localhost/plugin-health'));
  assertEquals(initialized, true);
  assertEquals(await response?.text(), 'ok');

  const cronJobs: string[] = [];
  manager.registerAllCronJobs((name, _schedule, _handler) => cronJobs.push(name));
  assertEquals(cronJobs, ['test-job']);

  await manager.disposeAll();
  assertEquals(disposed, true);
});

Deno.test('ExtensionManager isolates initialization failures', async () => {
  const manager = new ExtensionManager(createContext());
  let loaded = false;

  manager.use({
    name: 'broken-extension',
    init() {
      throw new Error('broken');
    },
  });
  manager.use({
    name: 'healthy-extension',
    init() {
      loaded = true;
    },
  });

  await manager.initAll();
  assertEquals(loaded, true);
  assertEquals(await manager.handleRequest(new Request('http://localhost/missing')), null);
});

Deno.test('ExtensionManager rejects duplicate routes without exposing partial registration', async () => {
  const manager = new ExtensionManager(createContext());
  manager.use({
    name: 'duplicate-extension',
    init() {},
    registerRoutes(router) {
      router.get('/same', async () => new Response('one'));
      router.get('/same', async () => new Response('two'));
    },
  });

  await manager.initAll();
  assertEquals(await manager.handleRequest(new Request('http://localhost/same')), null);
});
