import type { WorkspaceConfig, WorkspaceConfigSchema } from '@work-boost/data-schemas/config.ts';
import type { WorkspaceFS } from '../fs/workspace-fs.ts';

const CONFIG_PATH = '.workboost/config.json';

/**
 * Workspace configuration manager interface
 */
export interface ConfigManager {
  load(): Promise<WorkspaceConfig>;
  save(config: WorkspaceConfig): Promise<void>;
}

/**
 * Create a new config manager instance
 * @param fs Workspace file system instance
 */
export function createConfigManager(fs: WorkspaceFS): ConfigManager {
  let configCache: WorkspaceConfig | null = null;

  return {
    async load(): Promise<WorkspaceConfig> {
      if (configCache) return configCache;

      if (!(await fs.exists(CONFIG_PATH))) {
        const now = new Date().toISOString();
        const initial = {
          version: 1,
          workspaceName: 'My WorkBoost',
          createdAt: now,
          updatedAt: now,
        } as const;
        
        // Type assertion for initial config
        const validated = initial as WorkspaceConfig;
        await this.save(validated);
        return validated;
      }

      const raw = await fs.readText(CONFIG_PATH);
      const parsed = JSON.parse(raw);
      configCache = parsed as WorkspaceConfig;
      return configCache;
    },

    async save(config: WorkspaceConfig): Promise<void> {
      config.updatedAt = new Date().toISOString();
      const validated = config as WorkspaceConfig;
      await fs.writeTextAtomic(CONFIG_PATH, JSON.stringify(validated, null, 2));
      configCache = validated;
    },
  };
}
