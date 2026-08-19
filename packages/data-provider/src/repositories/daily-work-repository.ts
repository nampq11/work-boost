import {
  type DailyWorkDocument,
  type DailyWorkFrontmatter,
  DailyWorkFrontmatterSchema,
  type DailyWorkReport,
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
export interface SaveDailyWorkOptions {
  customSections?: string;
  updatedBy?: DailyWorkFrontmatter['updatedBy'];
}

export interface DailyWorkRepository {
  save(
    dateStr: string,
    report: DailyWorkReport,
    options?: SaveDailyWorkOptions,
  ): Promise<DailyWorkDocument>;
  saveContent(dateStr: string, content: string): Promise<DailyWorkDocument>;
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
    async save(
      dateStr: string,
      report: DailyWorkReport,
      options?: SaveDailyWorkOptions,
    ): Promise<DailyWorkDocument> {
      const filePath = getFilePath(dateStr);
      let customSections = options?.customSections ?? '';

      // Preserve existing custom sections only when the caller did not provide any
      if (customSections === '' && (await fs.exists(filePath))) {
        const existing = await this.get(dateStr);
        if (existing) customSections = existing.customSections;
      }

      const frontmatter = DailyWorkFrontmatterSchema.parse({
        id: `daily_${dateStr}`,
        date: dateStr,
        status: 'completed',
        updatedAt: new Date().toISOString(),
        updatedBy: options?.updatedBy,
      });

      const body = formatDailyReport(report, customSections);
      const rawMarkdown = stringifyMarkdown(frontmatter, body);

      await fs.writeTextAtomic(filePath, rawMarkdown);

      return { frontmatter, report, customSections, rawMarkdown, filePath };
    },

    async saveContent(dateStr: string, content: string): Promise<DailyWorkDocument> {
      const filePath = getFilePath(dateStr);
      const frontmatter = DailyWorkFrontmatterSchema.parse({
        id: `daily_${dateStr}`,
        date: dateStr,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
      const rawMarkdown = stringifyMarkdown(frontmatter, content);
      await fs.writeTextAtomic(filePath, rawMarkdown);
      const { report, customSections } = parseDailyReport(content);
      return { frontmatter, report, customSections, rawMarkdown, filePath };
    },

    async get(dateStr: string): Promise<DailyWorkDocument | null> {
      const filePath = getFilePath(dateStr);
      if (!(await fs.exists(filePath))) return null;

      const rawMarkdown = await fs.readText(filePath);
      const { frontmatter: rawFrontmatter, body } = parseMarkdown<unknown>(rawMarkdown);
      const frontmatter = DailyWorkFrontmatterSchema.parse(rawFrontmatter);
      const { report, customSections } = parseDailyReport(body);

      return { frontmatter, report, customSections, rawMarkdown, filePath };
    },

    async listDates(): Promise<string[]> {
      const files = await fs.listFiles('daily');
      return files.map((f) => f.replace(/^daily\/|\.md$/g, ''));
    },
  };
}
