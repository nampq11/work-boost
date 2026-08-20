/// <reference lib="deno.ns" />

import { join, toFileUrl } from '@std/path';
import type { ExtensionManager } from './manager.ts';
import { type ExtensionContext, isWorkBoostExtension } from './types.ts';

export interface PluginLoaderOptions {
  directory?: string;
}

function getPluginDirectory(): string {
  const homeDirectory = Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || '.';
  return join(homeDirectory, '.workboost', 'plugins');
}

export async function loadUserPlugins(
  manager: ExtensionManager,
  ctx: ExtensionContext,
  options: PluginLoaderOptions = {},
): Promise<void> {
  const pluginDirectory = options.directory || getPluginDirectory();

  try {
    const entries: string[] = [];
    for await (const entry of Deno.readDir(pluginDirectory)) {
      if (
        entry.isFile &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))
      ) {
        entries.push(entry.name);
      }
    }

    entries.sort();
    for (const entryName of entries) {
      try {
        const module = await import(toFileUrl(join(pluginDirectory, entryName)).href);
        const exportedPlugin =
          typeof module.default === 'function' ? module.default() : module.default;

        if (!isWorkBoostExtension(exportedPlugin)) {
          throw new Error('default export must be a WorkBoostExtension or a factory function');
        }

        manager.use(exportedPlugin);
        ctx.logger.info(`[PluginLoader] Discovered user plugin: ${entryName}`);
      } catch (error) {
        ctx.logger.error(`[PluginLoader] Failed to load plugin "${entryName}"`, { error });
      }
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    ctx.logger.warn(`[PluginLoader] Failed to scan plugin directory: ${pluginDirectory}`, {
      error,
    });
  }
}
