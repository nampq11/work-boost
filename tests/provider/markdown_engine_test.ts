import { assertEquals } from '@std/assert';
import {
  parseMarkdown,
  stringifyMarkdown,
  parseDailyReport,
  formatDailyReport,
} from '@work-boost/data-provider/markdown/markdown-engine.ts';

Deno.test('MarkdownEngine - round-trip serialization', () => {
  interface TestFrontmatter {
    title: string;
    date: string;
    tags: string[];
  }

  const original: TestFrontmatter = {
    title: 'Test Document',
    date: '2026-08-19',
    tags: ['test', 'example'],
  };

  const body = 'This is the content body.';
  const markdown = stringifyMarkdown(original, body);
  const { frontmatter, body: parsedBody } = parseMarkdown<TestFrontmatter>(markdown);

  assertEquals(frontmatter.title, original.title);
  assertEquals(frontmatter.date, original.date);
  assertEquals(frontmatter.tags, original.tags);
  assertEquals(parsedBody, body);
});

Deno.test('MarkdownEngine - handles files without frontmatter', () => {
  const plainContent = 'Just plain content without frontmatter';
  const { frontmatter, body } = parseMarkdown<Record<string, unknown>>(plainContent);

  assertEquals(Object.keys(frontmatter).length, 0);
  assertEquals(body, plainContent);
});

Deno.test('MarkdownEngine - preserves custom sections in daily reports', () => {
  const customNotes = `
### Additional Notes
Some custom notes here.
Another note below.
`;

  const report = {
    completed: [{ project: 'PROJ1', task: 'Task 1' }],
    incomplete: [{ project: 'PROJ2', task: 'Task 2' }],
    planned: [{ project: 'PROJ3', task: 'Task 3' }],
  };

  const formatted = formatDailyReport(report, customNotes);
  const { report: parsed, customSections } = parseDailyReport(formatted);

  assertEquals(parsed.completed.length, 1);
  assertEquals(parsed.completed[0].project, 'PROJ1');
  assertEquals(parsed.incomplete.length, 1);
  assertEquals(parsed.planned.length, 1);
  assertEquals(customSections.includes('Additional Notes'), true);
});

Deno.test('MarkdownEngine - parses daily report sections correctly', () => {
  const markdownBody = `
### 1. Việc hoàn thành hôm trước?
- **PROJ1**: Task completed
- **INBOX**: Another completed task

### 2. Việc dự định làm nhưng chưa hoàn thành?
- **PROJ2**: Incomplete task
- N/A

### 3. Việc dự định làm hôm nay?
- **PROJ3**: Planned task
- **PROJ4**: Another planned task
`;

  const { report, customSections } = parseDailyReport(markdownBody);

  assertEquals(report.completed.length, 2);
  assertEquals(report.completed[0].project, 'PROJ1');
  assertEquals(report.completed[1].project, 'INBOX');
  
  assertEquals(report.incomplete.length, 1);
  assertEquals(report.incomplete[0].project, 'PROJ2');
  
  assertEquals(report.planned.length, 2);
  assertEquals(report.planned[0].project, 'PROJ3');
  assertEquals(report.planned[1].project, 'PROJ4');
  
  assertEquals(customSections, '');
});

Deno.test('MarkdownEngine - formats daily reports with Vietnamese headers', () => {
  const report = {
    completed: [{ project: 'PROJ1', task: 'Completed task' }],
    incomplete: [],
    planned: [{ project: 'PROJ2', task: 'Planned task' }],
  };

  const formatted = formatDailyReport(report);

  assertEquals(formatted.includes('### 1. Việc hoàn thành hôm trước?'), true);
  assertEquals(formatted.includes('### 2. Việc dự định làm nhưng chưa hoàn thành?'), true);
  assertEquals(formatted.includes('### 3. Việc dự định làm hôm nay?'), true);
  assertEquals(formatted.includes('**PROJ1**: Completed task'), true);
  assertEquals(formatted.includes('- N/A'), true); // For empty incomplete section
});

Deno.test('MarkdownEngine - handles empty sections correctly', () => {
  const report = {
    completed: [],
    incomplete: [],
    planned: [],
  };

  const formatted = formatDailyReport(report);
  const { report: parsed } = parseDailyReport(formatted);

  assertEquals(parsed.completed.length, 0);
  assertEquals(parsed.incomplete.length, 0);
  assertEquals(parsed.planned.length, 0);
  
  // Should have N/A markers for empty sections
  const match = formatted.match(/- N/A/g);
  assertEquals((match || []).length, 3);
});
