import { fromFileUrl } from '@std/path';
import type { WorkspaceFS } from '@work-boost/data-provider';

/**
 * HTML Apps shipped with Work Boost. They are seeded into the user's
 * workspace root so users can freely edit or delete them.
 */
export const HTML_APPS = ['debt-tracker.html'] as const;

export interface BrokerRuntime {
  /** Broker client script defining window.workboost (packages/runtime/src/global.js) */
  js: string;
  /** Base theme CSS injected before Tailwind (packages/runtime/src/theme.css) */
  themeCss: string;
}

let cachedRuntime: BrokerRuntime | null = null;

async function readAsset(relativePath: string): Promise<string> {
  const filePath = fromFileUrl(new URL(relativePath, import.meta.url));
  return await Deno.readTextFile(filePath);
}

/**
 * Read the broker runtime assets (cached after first read).
 */
export async function readBrokerRuntime(): Promise<BrokerRuntime> {
  if (cachedRuntime) return cachedRuntime;
  cachedRuntime = {
    js: await readAsset('./src/global.js'),
    themeCss: await readAsset('./src/theme.css'),
  };
  return cachedRuntime;
}

/**
 * Copy the shipped HTML Apps into the workspace root when missing.
 * Existing files are never overwritten - the user owns their workspace.
 *
 * @returns names of the apps that were seeded
 */
export async function seedHtmlApps(fs: WorkspaceFS): Promise<string[]> {
  const seeded: string[] = [];
  for (const appName of HTML_APPS) {
    const template = await readAsset(`./src/apps/${appName}`);
    if (await fs.writeTextIfAbsent(appName, template)) seeded.push(appName);
  }
  return seeded;
}
