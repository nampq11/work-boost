// Core file system abstraction
export { createWorkspaceFS, type WorkspaceFS } from './src/fs/workspace-fs.ts';
export { createWorkspaceWatcher, type WorkspaceWatcher } from './src/fs/workspace-watcher.ts';

// Markdown processing
export {
  formatDailyReport,
  type MarkdownFrontmatter,
  parseDailyReport,
  parseMarkdown,
  stringifyMarkdown,
} from './src/markdown/markdown-engine.ts';

// Repository layer
export { type ConfigManager, createConfigManager } from './src/repositories/config-manager.ts';
export {
  createDailyWorkRepository,
  type DailyWorkRepository,
} from './src/repositories/daily-work-repository.ts';
export { createDebtRepository, type DebtRepository } from './src/repositories/debt-repository.ts';

import type { ConfigManager } from './src/repositories/config-manager.ts';
import type { DailyWorkRepository } from './src/repositories/daily-work-repository.ts';
import type { DebtRepository } from './src/repositories/debt-repository.ts';
import type { WorkspaceFS } from './src/fs/workspace-fs.ts';

export type DataLayer = {
  fs: WorkspaceFS;
  config: ConfigManager;
  dailyWork: DailyWorkRepository;
  debts: DebtRepository;
};

// Legacy exports (for backward compatibility)
export * from './src/database.ts';
export * from './src/indexes.ts';
export * from './src/migrations/migrate-slack-users.ts';

/**
 * Compatibility layer: create a complete data layer with all repositories
 * @param root Optional custom workspace root path
 */
export function createDataLayer(root?: string): DataLayer {
  const fs = createWorkspaceFS(root);
  return {
    fs,
    config: createConfigManager(fs),
    dailyWork: createDailyWorkRepository(fs),
    debts: createDebtRepository(fs),
  };
}
