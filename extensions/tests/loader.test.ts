import { assertEquals } from '@std/assert';
import { loadUserPlugins } from '../loader.ts';
import { ExtensionManager } from '../manager.ts';
import type { ExtensionContext } from '../types.ts';

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

Deno.test('loadUserPlugins discovers TypeScript plugin factories from a custom directory', async () => {
  const directory = await Deno.makeTempDir({ prefix: 'workboost-plugins-' });
  await Deno.writeTextFile(
    `${directory}/test-plugin.ts`,
    `export default () => ({
      name: 'test-plugin',
      init() {},
      registerRoutes(router) {
        router.get('/test-plugin', async () => new Response('loaded'));
      }
    });`,
  );

  const manager = new ExtensionManager(createContext());
  await loadUserPlugins(manager, createContext(), { directory });
  await manager.initAll();

  const response = await manager.handleRequest(new Request('http://localhost/test-plugin'));
  assertEquals(await response?.text(), 'loaded');

  await Deno.remove(directory, { recursive: true });
});

Deno.test('loadUserPlugins skips a missing plugin directory', async () => {
  const manager = new ExtensionManager(createContext());
  await loadUserPlugins(manager, createContext(), {
    directory: '/tmp/workboost-plugin-directory-that-does-not-exist',
  });
  await manager.initAll();
  assertEquals(await manager.handleRequest(new Request('http://localhost/missing')), null);
});
