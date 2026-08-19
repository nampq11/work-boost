import { z } from 'zod';

export interface TaskItem {
  project: string;
  task: string;
}

export interface DailyWorkReport {
  completed: TaskItem[];
  incomplete: TaskItem[];
  planned: TaskItem[];
}

/**
 * Zod schema for daily work document frontmatter (markdown storage)
 */
export const DailyWorkFrontmatterSchema = z.object({
  id: z.string(), // daily_YYYY-MM-DD
  date: z.string(), // YYYY-MM-DD
  status: z.enum(['draft', 'completed']).default('completed'),
  updatedAt: z.string().datetime(),
});

export type DailyWorkFrontmatter = z.infer<typeof DailyWorkFrontmatterSchema>;

/**
 * Daily work document interface for markdown storage
 */
export interface DailyWorkDocument {
  frontmatter: DailyWorkFrontmatter;
  report: DailyWorkReport;
  customSections: string; // Custom notes outside main sections
  rawMarkdown: string;
  filePath: string;
}

interface SucccessResponse {
  success: true;
  data: DailyWorkReport;
}

interface ErrorResponse {
  success: false;
  error: string;
}

export type AgentResponse = SucccessResponse | ErrorResponse;
