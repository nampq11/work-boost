import { test } from '@std/front-matter';
import { extract } from '@std/front-matter/yaml';
import { stringify } from '@std/yaml';
import type { DailyWorkReport, TaskItem } from '@work-boost/data-schemas/agent.ts';

/**
 * Parse markdown with YAML frontmatter
 */
export interface MarkdownFrontmatter<T> {
  frontmatter: T;
  body: string;
}

/**
 * Parse markdown file with YAML frontmatter
 */
export function parseMarkdown<T>(rawContent: string): MarkdownFrontmatter<T> {
  if (!test(rawContent)) {
    return { frontmatter: {} as T, body: rawContent.trim() };
  }
  const extracted = extract<T>(rawContent);
  return {
    frontmatter: extracted.attrs,
    body: extracted.body.trim(),
  };
}

/**
 * Stringify object and body into markdown with YAML frontmatter
 */
export function stringifyMarkdown<T>(frontmatter: T, body: string): string {
  const yaml = stringify(frontmatter).trim();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}

const COMPLETED_REGEX = /^### 1\.|việc hoàn thành/i;
const INCOMPLETE_REGEX = /^### 2\.|chưa hoàn thành/i;
const PLANNED_REGEX = /^### 3\.|dự định làm/i;

/**
 * Parse daily work report body, extracting structured sections
 * Preserves custom sections outside the main three sections
 */
export function parseDailyReport(body: string): {
  report: DailyWorkReport;
  customSections: string;
} {
  const report: DailyWorkReport = {
    completed: [],
    incomplete: [],
    planned: [],
  };
  const customLines: string[] = [];

  const lines = body.split('\n');
  let currentSection: 'completed' | 'incomplete' | 'planned' | 'custom' = 'custom';

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    if (COMPLETED_REGEX.test(trimmed)) {
      currentSection = 'completed';
    } else if (INCOMPLETE_REGEX.test(trimmed)) {
      currentSection = 'incomplete';
    } else if (PLANNED_REGEX.test(trimmed)) {
      currentSection = 'planned';
    } else if (trimmed.startsWith('###') && currentSection !== 'custom') {
      currentSection = 'custom';
      customLines.push(line);
    } else if (currentSection === 'custom') {
      customLines.push(line);
    } else if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
      const taskText = trimmed.replace(/^[-•*]\s*/, '');
      if (taskText.toLowerCase() === 'n/a' || !taskText) continue;

      // Parse "**PROJECT**: Task description" or "PROJECT: Task description"
      const match =
        taskText.match(/^\*\*([^*]+)\*\*:\s*(.*)$/) || taskText.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        report[currentSection].push({
          project: match[1].trim(),
          task: match[2].trim(),
        });
      } else {
        report[currentSection].push({
          project: 'INBOX',
          task: taskText,
        });
      }
    }
  }

  return {
    report,
    customSections: customLines.join('\n').trim(),
  };
}

/**
 * Format daily work report into markdown body
 */
export function formatDailyReport(report: DailyWorkReport, customSections = ''): string {
  function formatSection(tasks: TaskItem[]): string {
    if (!tasks || tasks.length === 0) return '- N/A';
    return tasks.map((task) => `- **${task.project || 'INBOX'}**: ${task.task}`).join('\n');
  }

  let result =
    `### 1. What did I complete?\n${formatSection(report.completed)}\n\n` +
    `### 2. What did I plan but not finish?\n${formatSection(report.incomplete)}\n\n` +
    `### 3. What will I do today?\n${formatSection(report.planned)}`;

  if (customSections.trim()) {
    result += `\n\n${customSections.trim()}`;
  }

  return result;
}
