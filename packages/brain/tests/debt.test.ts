import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import { createDebtTool, getWorkspaceTools } from '@work-boost/brain';
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

  return repo;
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

function makeDebt(
  id: string,
  personName: string,
  amount: number,
  direction: DebtDirection = DebtDirection.LENT,
  status: DebtStatus = DebtStatus.PENDING,
): DebtDocument {
  return {
    frontmatter: {
      id,
      direction,
      amount,
      currency: 'VND',
      personName,
      status,
      debtDate: '2025-01-15',
      createdAt: '2025-01-15T00:00:00Z',
      updatedAt: '2025-01-15T00:00:00Z',
      paidAt: null,
      updatedBy: 'agent',
    },
    reason: '',
    filePath: `debts/${id}.md`,
  };
}

Deno.test('debt list returns all debts without filters', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'list' });
  assertEquals(textOf(result).includes('Charlie'), true);
  assertEquals(textOf(result).includes('Alice'), true);
});

Deno.test('debt list filters by personName', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'list', personName: 'charl' });
  const data = (result.details as { data: DebtDocument[] }).data;
  assertEquals(data.length, 1);
  assertEquals(data[0].frontmatter.personName, 'Charlie');
});

Deno.test('debt list filters by status and direction', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', {
    action: 'list',
    status: 'pending',
    direction: 'lent',
  });
  const data = (result.details as { data: DebtDocument[] }).data;
  assertEquals(data.length, 1);
  assertEquals(data[0].frontmatter.direction, DebtDirection.LENT);
});

Deno.test('debt list shows empty state', async () => {
  const repo = createFakeDebtRepository([]);
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'list' });
  assertEquals(textOf(result), '📭 No debts.');
});

Deno.test('debt settle marks a pending debt as paid', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'settle', debtId: 'debt-1' });
  assertEquals(textOf(result).includes('Marked debt'), true);
  const data = (result.details as { data: DebtDocument }).data;
  assertEquals(data.frontmatter.status, DebtStatus.PAID);
});

Deno.test('debt settle throws when debt not found', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  await assertRejects(
    () => tool.execute('call_1', { action: 'settle', debtId: 'nonexistent' }),
    Error,
    'not found',
  );
});

Deno.test('debt settle confirms already-paid debt', async () => {
  const debts = sampleDebts();
  debts[0].frontmatter.status = DebtStatus.PAID;
  const repo = createFakeDebtRepository(debts);
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'settle', debtId: 'debt-1' });
  assertEquals(textOf(result).includes('already settled'), true);
});

Deno.test('debt settle throws when debtId is missing', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  await assertRejects(() => tool.execute('call_1', { action: 'settle' }), Error);
});

Deno.test('debt summary calculates net position', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'summary' });
  const data = (result.details as { data: unknown }).data as {
    totalLent: number;
    totalBorrowed: number;
    netPosition: number;
  };
  assertEquals(data.totalLent, 100000);
  assertEquals(data.totalBorrowed, 50000);
  assertEquals(data.netPosition, 50000);
  assertEquals(textOf(result).includes('Owed to you'), true);
});

Deno.test('debt delete removes a debt', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'delete', debtId: 'debt-1' });
  assertEquals(textOf(result).includes('Deleted debt'), true);
});

Deno.test('debt delete throws when debt not found', async () => {
  const repo = createFakeDebtRepository(sampleDebts());
  const tool = createDebtTool(repo);
  await assertRejects(
    () => tool.execute('call_1', { action: 'delete', debtId: 'nonexistent' }),
    Error,
    'not found',
  );
});

Deno.test('debt settle resolves a single pending debt by personName', async () => {
  const debts = [
    makeDebt('debt-1', 'Charlie', 100000),
    makeDebt('debt-2', 'Alice', 50000, DebtDirection.BORROWED),
  ];
  const repo = createFakeDebtRepository(debts);
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'settle', personName: 'Charlie' });
  assertEquals(textOf(result).includes('Marked debt'), true);
  const data = (result.details as { data: DebtDocument }).data;
  assertEquals(data.frontmatter.status, DebtStatus.PAID);
});

Deno.test('debt settle disambiguates matching debts by amount', async () => {
  const debts = [makeDebt('debt-1', 'Bob', 100000), makeDebt('debt-2', 'Bob', 50000)];
  const repo = createFakeDebtRepository(debts);
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', {
    action: 'settle',
    personName: 'Bob',
    amount: 50000,
  });
  const data = (result.details as { data: DebtDocument }).data;
  assertEquals(data.frontmatter.id, 'debt-2');
  assertEquals(data.frontmatter.status, DebtStatus.PAID);
});

Deno.test('debt settle throws when a person has multiple matching debts', async () => {
  const debts = [makeDebt('debt-1', 'Bob', 100000), makeDebt('debt-2', 'Bob', 50000)];
  const repo = createFakeDebtRepository(debts);
  const tool = createDebtTool(repo);
  await assertRejects(
    () => tool.execute('call_1', { action: 'settle', personName: 'Bob' }),
    Error,
    'Multiple debts',
  );
});

Deno.test('debt settle throws when no pending debt matches personName', async () => {
  const repo = createFakeDebtRepository([makeDebt('debt-1', 'Charlie', 100000)]);
  const tool = createDebtTool(repo);
  await assertRejects(
    () => tool.execute('call_1', { action: 'settle', personName: 'Nobody' }),
    Error,
  );
});

Deno.test('debt delete resolves a single debt by personName', async () => {
  const debts = [makeDebt('debt-1', 'Charlie', 100000)];
  const repo = createFakeDebtRepository(debts);
  const tool = createDebtTool(repo);
  const result = await tool.execute('call_1', { action: 'delete', personName: 'Charlie' });
  assertEquals(textOf(result).includes('Deleted debt'), true);
  assertEquals(debts.length, 0);
});

Deno.test('debt delete throws when a person has multiple debts', async () => {
  const debts = [makeDebt('debt-1', 'Bob', 100000), makeDebt('debt-2', 'Bob', 50000)];
  const repo = createFakeDebtRepository(debts);
  const tool = createDebtTool(repo);
  await assertRejects(
    () => tool.execute('call_1', { action: 'delete', personName: 'Bob' }),
    Error,
    'Multiple debts',
  );
});

Deno.test('getWorkspaceTools returns the generic tool set', () => {
  const fs = {
    init: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
    writeTextAtomic: () => Promise.resolve(),
    writeTextIfAbsent: () => Promise.resolve(true),
    move: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    listFiles: () => Promise.resolve([]),
    listByGlob: () => Promise.resolve([]),
    stat: () => Promise.resolve({ size: 0, modifiedAt: '' }),
    listDirs: () => Promise.resolve([]),
    exists: () => Promise.resolve(false),
    mkdir: () => Promise.resolve(),
    conditionalUpdate: () => Promise.resolve({ status: 'not-found' as const }),
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
  assertEquals(names.length, 5);
  assertEquals(names.includes('get_current_time'), true);
  assertEquals(names.includes('debt'), true);
  assertEquals(names.includes('daily_work'), true);
  assertEquals(names.includes('workspace'), true);
  assertEquals(names.includes('create_document'), true);
});
