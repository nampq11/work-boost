import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import { createDocumentTool } from '@work-boost/brain';
import {
  type DailyWorkRepository,
  type DebtRepository,
  type WorkspaceFS,
  createDocumentTemplates,
} from '@work-boost/data-provider';
import type { DailyWorkDocument } from '@work-boost/data-schemas/agent.ts';
import { DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';

function textOf(result: AgentToolResult<unknown>): string {
  const textBlock = result.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

interface Capture {
  path: string;
  content: string;
}

function createRecordingFS(isExisting?: (path: string, attemptCount: number) => boolean): {
  fs: WorkspaceFS;
  attempts: Capture[];
  writes: Capture[];
  overwrites: Capture[];
} {
  const attempts: Capture[] = [];
  const writes: Capture[] = [];
  const overwrites: Capture[] = [];
  const attemptsByPath = new Map<string, number>();
  const fs: WorkspaceFS = {
    root: '/tmp/fake',
    init: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
    writeTextAtomic: (path, content) => {
      overwrites.push({ path, content });
      return Promise.resolve();
    },
    writeTextIfAbsent: (path, content) => {
      attempts.push({ path, content });
      const attemptCount = (attemptsByPath.get(path) ?? 0) + 1;
      attemptsByPath.set(path, attemptCount);
      if (isExisting?.(path, attemptCount)) return Promise.resolve(false);
      writes.push({ path, content });
      return Promise.resolve(true);
    },
    move: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    listByGlob: () => Promise.resolve([]),
    listFiles: () => Promise.resolve([]),
    exists: () => Promise.resolve(true),
    stat: () => Promise.resolve({ size: 0, modifiedAt: '' }),
    listDirs: () => Promise.resolve([]),
    mkdir: () => Promise.resolve(),
    conditionalUpdate: () => Promise.resolve({ status: 'not-found' as const }),
  };
  return { fs, attempts, writes, overwrites };
}

function createFakeDebtRepository(): DebtRepository {
  return {
    async create(data) {
      const doc: DebtDocument = {
        frontmatter: {
          id: 'debt-1',
          direction: data.direction,
          amount: data.amount,
          currency: data.currency || 'VND',
          personName: data.personName,
          status: DebtStatus.PENDING,
          debtDate: data.debtDate || '2025-01-15',
          createdAt: '2025-01-15T00:00:00Z',
          updatedAt: '2025-01-15T00:00:00Z',
          paidAt: null,
          updatedBy: 'agent',
        },
        reason: data.reason || '',
        filePath: `debts/${data.personName.toLowerCase()}-1.md`,
      };
      return doc;
    },
    getById: async () => null,
    listAll: async () => [],
    filter: async () => [],
    settle: async () => null,
    cancel: async () => null,
    update: async () => null,
    delete: async () => false,
    getSummary: async () => ({
      totalLent: 0,
      totalBorrowed: 0,
      totalLentPaid: 0,
      totalBorrowedPaid: 0,
      pendingLentCount: 0,
      pendingBorrowedCount: 0,
      netPosition: 0,
      currencies: {},
    }),
  };
}

function createFakeDailyWorkRepository(): DailyWorkRepository {
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
      return doc;
    },
    saveContent: async (dateStr) =>
      ({
        frontmatter: {
          id: `daily_${dateStr}`,
          date: dateStr,
          status: 'completed',
          updatedAt: '2025-01-15T00:00:00Z',
          updatedBy: 'agent',
        },
        report: { completed: [], incomplete: [], planned: [] },
        customSections: '',
        rawMarkdown: '',
        filePath: `daily/${dateStr}.md`,
      }) as DailyWorkDocument,
    get: async () => null,
    listDates: async () => [],
  };
}

function buildTool() {
  const { fs, attempts, writes, overwrites } = createRecordingFS();
  const templates = createDocumentTemplates({
    fs,
    debts: createFakeDebtRepository(),
    dailyWork: createFakeDailyWorkRepository(),
  });
  return { tool: createDocumentTool(templates), fs, attempts, writes, overwrites };
}

Deno.test('create_document type=note writes to a notes/*.md path', async () => {
  const { tool, writes } = buildTool();
  const result = await tool.execute('call_1', { type: 'note', data: { content: 'Hello' } });

  assertEquals(writes.length, 1);
  assertEquals(writes[0].path.startsWith('notes/'), true);
  assertEquals(writes[0].path.endsWith('.md'), true);
  assertEquals(textOf(result).includes('notes/'), true);
  assertEquals(textOf(result).includes('📝'), true);
});

Deno.test('create_document type=note adds a heading when a title is given', async () => {
  const { tool, writes } = buildTool();
  await tool.execute('call_1', { type: 'note', data: { content: 'Body', title: 'My Note' } });

  assertEquals(writes[0].content.startsWith('# My Note'), true);
  assertEquals(writes[0].content.includes('Body'), true);
});

Deno.test('create_document type=note rejects empty or whitespace-only content', async () => {
  const { tool, writes } = buildTool();

  await assertRejects(() => tool.execute('call_1', { type: 'note', data: { content: '' } }), Error);
  assertEquals(writes.length, 0);

  await assertRejects(
    () => tool.execute('call_1', { type: 'note', data: { content: '   \n\t' } }),
    Error,
  );
  assertEquals(writes.length, 0);
});

Deno.test('create_document type=note slugs the title into a safe dashed path', async () => {
  const { tool, writes } = buildTool();
  await tool.execute('call_1', {
    type: 'note',
    data: { content: 'Body', title: 'Ghi chú Tháng 12!' },
  });

  const match = writes[0].path.match(/^notes\/([a-z0-9-]+)-\d{8}-\d{6}\.md$/);
  assertEquals(match !== null, true);
  assertEquals(match![1], 'ghi-chu-thang-12');
});

Deno.test('create_document type=note never overwrites an existing file', async () => {
  const { tool, writes, overwrites } = buildTool();
  await tool.execute('call_1', { type: 'note', data: { content: 'Hello' } });

  assertEquals(writes.length, 1);
  assertEquals(overwrites.length, 0);
});

Deno.test('create_document type=note retries with a counter suffix when the path is taken', async () => {
  let occupiedPath: string | null = null;
  const { fs, attempts, writes } = createRecordingFS((path) => {
    occupiedPath ??= path;
    return path === occupiedPath;
  });
  const tool = createDocumentTool(
    createDocumentTemplates({
      fs,
      debts: createFakeDebtRepository(),
      dailyWork: createFakeDailyWorkRepository(),
    }),
  );
  const result = await tool.execute('call_1', {
    type: 'note',
    data: { content: 'Hello', title: 'Idea' },
  });

  const [baseAttempt, retryAttempt] = attempts;
  assertEquals(retryAttempt.path, baseAttempt.path.replace(/\.md$/, '-1.md'));
  assertEquals(writes.length, 1);
  assertEquals(writes[0].path, retryAttempt.path);
  assertEquals(textOf(result).includes(retryAttempt.path), true);
});

Deno.test('create_document type=debt creates a debt and reports the path', async () => {
  const { tool } = buildTool();
  const result = await tool.execute('call_1', {
    type: 'debt',
    data: { personName: 'John', amount: 50000, direction: 'lent', reason: 'lunch' },
  });

  assertEquals(textOf(result).includes('cho vay'), true);
  assertEquals(textOf(result).includes('John'), true);
  assertEquals(textOf(result).includes('50'), true);
  assertEquals((result.details as { data: { path: string } }).data.path.startsWith('debts/'), true);
});

Deno.test('create_document type=debt defaults currency to VND', async () => {
  const { tool } = buildTool();
  const result = await tool.execute('call_1', {
    type: 'debt',
    data: { personName: 'John', amount: 50000, direction: 'borrowed' },
  });
  const path = (result.details as { data: { path: string } }).data.path;
  assertEquals(path.startsWith('debts/'), true);
});

Deno.test('create_document type=daily saves a report', async () => {
  const { tool } = buildTool();
  const result = await tool.execute('call_1', {
    type: 'daily',
    data: {
      date: '2025-01-15',
      completed: [{ project: 'A', task: 'Fix bug' }],
      incomplete: [],
      planned: [],
    },
  });

  assertEquals(textOf(result).includes('Đã lưu báo cáo công việc ngày 2025-01-15'), true);
  assertEquals((result.details as { data: { path: string } }).data.path, 'daily/2025-01-15.md');
});

Deno.test('create_document rejects an unknown type', async () => {
  const { tool } = buildTool();
  await assertRejects(
    () => tool.execute('call_1', { type: 'nope', data: {} }),
    Error,
    'không hợp lệ',
  );
});

Deno.test('create_document validates type-specific data', async () => {
  const { tool } = buildTool();
  await assertRejects(
    () => tool.execute('call_1', { type: 'debt', data: { personName: 'John' } }),
    Error,
  );
});

Deno.test('create_document returns the list of valid types in its description', () => {
  const { tool } = buildTool();
  assertEquals(tool.description.includes('note'), true);
  assertEquals(tool.description.includes('debt'), true);
  assertEquals(tool.description.includes('daily'), true);
});
