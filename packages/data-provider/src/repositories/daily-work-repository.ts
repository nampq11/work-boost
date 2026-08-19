import type {
  DailyWorkDocument,
  DailyWorkFrontmatter,
  DailyWorkReport,
} from '@work-boost/data-schemas/agent.ts';
import type { WorkspaceFS } from '../fs/workspace-fs.ts';
import {
  formatDailyReport,
  parseDailyReport,
  parseMarkdown,
  stringifyMarkdown,
} from '../markdown/markdown-engine.ts';

/**
 * Daily work repository interface
 */
export interface DailyWorkRepository {
  save(dateStr: string, report: DailyWorkReport): Promise<DailyWorkDocument>;
  get(dateStr: string): Promise<DailyWorkDocument | null>;
  listDates(): Promise<string[]>;
}

/**
 * Create a new daily work repository instance
 * @param fs Workspace file system instance
 */
export function createDailyWorkRepository(fs: WorkspaceFS): DailyWorkRepository {
  const getFilePath = (dateStr: string) => `daily/${dateStr}.md`;

  return {
    async save(dateStr: string, report: DailyWorkReport): Promise<DailyWorkDocument> {
      const filePath = getFilePath(dateStr);
      let customSections = '';

      // Preserve custom sections if file exists
      if (await fs.exists(filePath)) {
        const existing = await this.get(dateStr);
        if (existing) customSections = existing.customSections;
      }

      const frontmatter: DailyWorkFrontmatter = {
        id: `daily_${dateStr}`,
        date: dateStr,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      };

      const body = formatDailyReport(report, customSections);
      const rawMarkdown = stringifyMarkdown(frontmatter, body);

      await fs.writeTextAtomic(filePath, rawMarkdown);

      return { frontmatter, report, customSections, rawMarkdown, filePath };
    },

    async get(dateStr: string): Promise<DailyWorkDocument | null> {
      const filePath = getFilePath(dateStr);
      if (!(await fs.exists(filePath))) return null;

      const rawMarkdown = await fs.readText(filePath);
      const { frontmatter, body } = parseMarkdown<DailyWorkFrontmatter>(rawMarkdown);
      const { report, customSections } = parseDailyReport(body);

      return { frontmatter, report, customSections, rawMarkdown, filePath };
    },

    async listDates(): Promise<string[]> {
      const files = await fs.listFiles('daily');
      return files.map(f => f.replace(/^daily\/|\.md$/g, ''));
    },
  };
}
