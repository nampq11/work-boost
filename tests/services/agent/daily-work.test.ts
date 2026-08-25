import { type AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import { createDailyWorkTool } from '@work-boost/brain';
import type { DailyWorkRepository } from '@work-boost/data-provider';
import type { DailyWorkDocument } from '@work-boost/data-schemas/agent.ts';

function textOf(result: AgentToolResult<unknown>): string {
  const textBlock = result.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

function createFakeDailyWorkRepository(docs: DailyWorkDocument[] = []): DailyWorkRepository {
  return {
    async save(dateStr, report) {
      const doc: DailyWorkDocument = {
        frontmatter: {
          id: `daily_${dateStr}`,
          date: dateStr,
          status: 'completed',
          updatedAt: '2025-01-15T00:00:00Z',
          updatedBy: 'agent',
        },
        report,
        customSections: '',
        rawMarkdown: '',
        filePath: `daily/${dateStr}.md`,
      };
      const existing = docs.findIndex((d) => d.frontmatter.date === dateStr);
      if (existing >= 0) docs[existing] = doc;
      else docs.push(doc);
      return doc;
    },
    async saveContent(dateStr, content) {
      const doc: DailyWorkDocument = {
        frontmatter: {
          id: `daily_${dateStr}`,
          date: dateStr,
          status: 'completed',
          updatedAt: '2025-01-15T00:00:00Z',
          updatedBy: 'agent',
        },
        report: { completed: [], incomplete: [], planned: [] },
        customSections: '',
        rawMarkdown: content,
        filePath: `daily/${dateStr}.md`,
      };
      return doc;
    },
    async get(dateStr) {
      return docs.find((d) => d.frontmatter.date === dateStr) ?? null;
    },
    async listDates() {
      return docs.map((d) => d.frontmatter.date);
    },
  };
}

function sampleDocs(): DailyWorkDocument[] {
  return [
    {
      frontmatter: {
        id: 'daily_2025-01-15',
        date: '2025-01-15',
        status: 'completed',
        updatedAt: '2025-01-15T00:00:00Z',
        updatedBy: 'agent',
      },
      report: {
        completed: [{ project: 'A', task: 'Fix bug' }],
        incomplete: [{ project: 'B', task: 'Write docs' }],
        planned: [{ project: 'A', task: 'Review PR' }],
      },
      customSections: '',
      rawMarkdown: '',
      filePath: 'daily/2025-01-15.md',
    },
  ];
}

Deno.test('daily_work get returns the report for a date', async () => {
  const repo = createFakeDailyWorkRepository(sampleDocs());
  const tool = createDailyWorkTool(repo);
  const result = await tool.execute('call_1', { action: 'get', date: '2025-01-15' });

  assertEquals(textOf(result).includes('2025-01-15'), true);
  assertEquals(textOf(result).includes('Fix bug'), true);
  assertEquals(textOf(result).includes('File:'), true);
});

Deno.test('daily_work get reports not found for missing date', async () => {
  const repo = createFakeDailyWorkRepository([]);
  const tool = createDailyWorkTool(repo);
  const result = await tool.execute('call_1', { action: 'get', date: '2025-01-15' });
  assertEquals(textOf(result), '❌ Không tìm thấy báo cáo công việc ngày 2025-01-15.');
});

Deno.test('daily_work list_dates returns all dates', async () => {
  const docs: DailyWorkDocument[] = [
    {
      frontmatter: {
        id: 'daily_2025-01-15',
        date: '2025-01-15',
        status: 'completed',
        updatedAt: '',
        updatedBy: 'agent',
      },
      report: { completed: [], incomplete: [], planned: [] },
      customSections: '',
      rawMarkdown: '',
      filePath: 'daily/2025-01-15.md',
    },
    {
      frontmatter: {
        id: 'daily_2025-01-16',
        date: '2025-01-16',
        status: 'completed',
        updatedAt: '',
        updatedBy: 'agent',
      },
      report: { completed: [], incomplete: [], planned: [] },
      customSections: '',
      rawMarkdown: '',
      filePath: 'daily/2025-01-16.md',
    },
  ];

  const repo = createFakeDailyWorkRepository(docs);
  const tool = createDailyWorkTool(repo);
  const result = await tool.execute('call_1', { action: 'list_dates' });

  const data = (result.details as { data: string[] }).data;
  assertEquals(data.length, 2);
  assertEquals(data.includes('2025-01-15'), true);
  assertEquals(data.includes('2025-01-16'), true);
});

Deno.test('daily_work list_dates shows empty state', async () => {
  const repo = createFakeDailyWorkRepository([]);
  const tool = createDailyWorkTool(repo);
  const result = await tool.execute('call_1', { action: 'list_dates' });
  assertEquals(textOf(result), '📭 Chưa có báo cáo công việc nào.');
});
