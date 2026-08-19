// Core file system abstraction
export { createWorkspaceFS, type WorkspaceFS } from './src/fs/workspace-fs.ts';
export { createWorkspaceWatcher, type WorkspaceWatcher } from './src/fs/workspace-watcher.ts';

// Markdown processing
export {
  parseMarkdown,
  stringifyMarkdown,
  parseDailyReport,
  formatDailyReport,
  type MarkdownFrontmatter,
} from './src/markdown/markdown-engine.ts';

// Repository layer
export { createConfigManager, type ConfigManager } from './src/repositories/config-manager.ts';
export { createDailyWorkRepository, type DailyWorkRepository } from './src/repositories/daily-work-repository.ts';
export { createDebtRepository, type DebtRepository } from './src/repositories/debt-repository.ts';

// Legacy exports (for backward compatibility)
export * from './src/database.ts';
export * from './src/indexes.ts';
export * from './src/migrations/migrate-slack-users.ts';

/**
 * Compatibility layer: create a complete data layer with all repositories
 * @param root Optional custom workspace root path
 */
export function createDataLayer(root?: string) {
  const fs = createWorkspaceFS(root);
  return {
    fs,
    config: createConfigManager(fs),
    dailyWork: createDailyWorkRepository(fs),
    debts: createDebtRepository(fs),
  };
}
