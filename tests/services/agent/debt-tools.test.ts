import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import {
  createCreateDebtTool,
  createDeleteDebtTool,
  createGetDebtSummaryTool,
  createListDebtsTool,
  createSettleDebtTool,
  getWorkspaceTools,
} from '@work-boost/brain';
import type { DebtRepository } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';

function textOf(result: AgentToolResult<unknown>): string {
  const textBlock = result.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

function createFakeDebtRepository(debts: DebtDocument[]): DebtRepository {
  const repo: DebtRepository = {
    async create(data) {
      const doc: DebtDocument = {
        frontmatter: {
          id: `debt-1`,
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
        filePath: `debts/${Date.now()}.md`,
      };
      debts.push(doc);
      return doc;
    },
    async getById(id) {
      return debts.find((d) => d.frontmatter.id === id) ?? null;
    },
    async listAll() {
      return [...debts];
    },
    async filter(options) {
      return debts.filter((d) => {
        if (options.status && d.frontmatter.status !== options.status) return false;
        if (options.direction && d.frontmatter.direction !== options.direction) return false;
        if (
          options.personName &&
          !d.frontmatter.personName.toLowerCase().includes(options.personName.toLowerCase())
        ) {
          return false;
        }
        return true;
      });
    },
    async settle(id) {
      const debt = debts.find((d) => d.frontmatter.id === id);
      if (!debt) return null;
      debt.frontmatter.status = DebtStatus.PAID;
      debt.frontmatter.paidAt = new Date().toISOString();
      debt.frontmatter.updatedAt = new Date().toISOString();
      return debt;
    },
    async cancel(id) {
      const debt = debts.find((d) => d.frontmatter.id === id);
      if (!debt || debt.frontmatter.status !== DebtStatus.PENDING) return null;
      debt.frontmatter.status = DebtStatus.CANCELLED;
      return debt;
    },
    async update(id, updates) {
      const debt = debts.find((d) => d.frontmatter.id === id);
      if (!debt) return null;
      Object.assign(debt.frontmatter, updates);
      return debt;
    },
    async delete(id) {
      const index = debts.findIndex((d) => d.frontmatter.id === id);
      if (index === -1) return false;
      debts.splice(index, 1);
      return true;
    },
    async getSummary() {
      let totalLent = 0;
      let totalBorrowed = 0;
      let pendingLentCount = 0;
      let pendingBorrowedCount = 0;

      for (const d of debts) {
        if (d.frontmatter.direction === DebtDirection.LENT) {
          totalLent += d.frontmatter.amount;
          if (d.frontmatter.status === DebtStatus.PENDING) pendingLentCount++;
        } else {
          totalBorrowed += d.frontmatter.amount;
          if (d.frontmatter.status === DebtStatus.PENDING) pendingBorrowedCount++;
        }
      }

      return {
        totalLent,
        totalBorrowed,
        totalLentPaid: 0,
        totalBorrowedPaid: 0,
        pendingLentCount,
        pendingBorrowedCount,
        netPosition: totalLent - totalBorrowed,
        currencies: {},
      };
    },
  };

  const repoWithId = repo as unknown as DebtRepository & { __testId: number };
  (repoWithId as any).__testId = 1;
  return repoWithId;
}

function sampleDebts(): DebtDocument[] {
  return [
    {
      frontmatter: {
        id: 'debt-1',
        direction: DebtDirection.LENT,
        amount: 100000,
        currency: 'VND',
        personName: 'Charlie',
        status: DebtStatus.PENDING,
        debtDate: '2025-01-15',
        createdAt: '2025-01-15T00:00:00Z',
        updatedAt: '2025-01-15T00:00:00Z',
        paidAt: null,
        updatedBy: 'agent',
      },
      reason: 'lunch',
      filePath: 'debts/charlie-1.md',
    },
    {
      frontmatter: {
        id: 'debt-2',
        direction: DebtDirection.BORROWED,
        amount: 50000,
        currency: 'VND',
        personName: 'Alice',
        status: DebtStatus.PENDING,
        debtDate: '2025-01-16',
        createdAt: '2025-01-16T00:00:00Z',
        updatedAt: '2025-01-16T00:00:00Z',
        paidAt: null,
        updatedBy: 'agent',
      },
      reason: '',
      filePath: 'debts/alice-1.md',
    },
  ];
}

Deno.test('create_debt creates a new debt record', async () => {
  const repo = createFakeDebtRepository([]);
  const tool = createCreateDebtTool(repo);
  const result = await tool.execute('call_1', {
    personName: 'John',
    amount: 50000,
    direction: 'lent',
    reason: 'lunch',
    currency: 'VND',
  });
  assertEquals(textOf(result).includes('cho vay'), true);
  assertEquals(textOf(result).includes('John'), true);
  assertEquals(textOf(result).includes('50'), true);
  assertEquals(textOf(result).includes('📄'), true);
});

Deno.test('create_debt defaults currency to VND', async () => {
  const repo = createFakeDebtRepository([]);
  const tool = createCreateDebtTool(repo);
  const result = await tool.execute('call_1', {
    personName: 'John',
    amount: 50000,
    direction: 'borrowed',
  });
  const data = (result.details as { data: DebtDocument }).data;
  assertEquals(data.frontmatter.currency, 'VND');
});

Deno.test('list_debts returns all debts without filters', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createListDebtsTool(repo);
  const result = await tool.execute('call_1', {});
  assertEquals(textOf(result).includes('Charlie'), true);
  assertEquals(textOf(result).includes('Alice'), true);
});

Deno.test('list_debts filters by personName', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createListDebtsTool(repo);
  const result = await tool.execute('call_1', { personName: 'charl' });
  const data = (result.details as { data: DebtDocument[] }).data;
  assertEquals(data.length, 1);
  assertEquals(data[0].frontmatter.personName, 'Charlie');
});

Deno.test('list_debts filters by status and direction', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createListDebtsTool(repo);
  const result = await tool.execute('call_1', { status: 'pending', direction: 'lent' });
  const data = (result.details as { data: DebtDocument[] }).data;
  assertEquals(data.length, 1);
  assertEquals(data[0].frontmatter.direction, DebtDirection.LENT);
});

Deno.test('list_debts shows empty state', async () => {
  const repo = createFakeDebtRepository([]);
  const tool = createListDebtsTool(repo);
  const result = await tool.execute('call_1', {});
  assertEquals(textOf(result), '📭 Không có khoản nợ nào.');
});

Deno.test('settle_debt marks a pending debt as paid', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createSettleDebtTool(repo);
  const result = await tool.execute('call_1', { debtId: 'debt-1' });
  assertEquals(textOf(result).includes('Đã đánh dấu'), true);
  const data = (result.details as { data: DebtDocument }).data;
  assertEquals(data.frontmatter.status, DebtStatus.PAID);
});

Deno.test('settle_debt throws when debt not found', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createSettleDebtTool(repo);
  await assertRejects(() => tool.execute('call_1', { debtId: 'nonexistent' }), Error, 'not found');
});

Deno.test('settle_debt confirms already-paid debt', async () => {
  const debts = sampleDebts();
  debts[0].frontmatter.status = DebtStatus.PAID;
  const repo = createFakeDebtRepository(debts);
  const tool = createSettleDebtTool(repo);
  const result = await tool.execute('call_1', { debtId: 'debt-1' });
  assertEquals(textOf(result).includes('được thanh toán rồi'), true);
});

Deno.test('get_debt_summary calculates net position', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createGetDebtSummaryTool(repo);
  const result = await tool.execute('call_1', {});
  const data = (result.details as { data: unknown }).data as {
    totalLent: number;
    totalBorrowed: number;
    netPosition: number;
  };
  assertEquals(data.totalLent, 100000);
  assertEquals(data.totalBorrowed, 50000);
  assertEquals(data.netPosition, 50000);
  assertEquals(textOf(result).includes('được nợ'), true);
});

Deno.test('delete_debt removes a debt', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDeleteDebtTool(repo);
  const result = await tool.execute('call_1', { debtId: 'debt-1' });
  assertEquals(textOf(result).includes('Đã xóa'), true);
});

Deno.test('delete_debt throws when debt not found', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDeleteDebtTool(repo);
  await assertRejects(() => tool.execute('call_1', { debtId: 'nonexistent' }), Error, 'not found');
});

Deno.test('getWorkspaceTools returns all 12 tools', () => {
  const fs = {
    init: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
    writeTextAtomic: () => Promise.resolve(),
    writeTextIfAbsent: () => Promise.resolve(true),
    move: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    listFiles: () => Promise.resolve([]),
    stat: () => Promise.resolve({ size: 0 }),
    listDirs: () => Promise.resolve([]),
  };
  const tools = getWorkspaceTools({
    fs: fs as never,
    config: {
      load: () => Promise.resolve({ timezone: 'Asia/Ho_Chi_Minh' } as never),
      save: () => Promise.resolve(),
    },
    dailyWork: createFakeDebtRepository([]) as never,
    debts: createFakeDebtRepository([]) as never,
  });
  const names = tools.map((t) => t.name);
  assertEquals(names.length, 12);
  assertEquals(names.includes('get_current_time'), true);
  assertEquals(names.includes('create_debt'), true);
  assertEquals(names.includes('list_debts'), true);
  assertEquals(names.includes('settle_debt'), true);
  assertEquals(names.includes('get_debt_summary'), true);
  assertEquals(names.includes('delete_debt'), true);
  assertEquals(names.includes('save_daily_work'), true);
  assertEquals(names.includes('get_daily_work'), true);
  assertEquals(names.includes('list_daily_dates'), true);
  assertEquals(names.includes('read_workspace_file'), true);
  assertEquals(names.includes('list_workspace_files'), true);
  assertEquals(names.includes('create_note'), true);
});
