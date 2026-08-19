import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { assertEquals, assertRejects } from '@std/assert';
import {
  createCreateDebtTool,
  createDeleteDebtTool,
  createQueryDebtTool,
  createQueryTaskTool,
  createQueryUserTool,
  createUpdateDebtTool,
  getDatabaseTools,
} from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas';
import type { Debt, Message, User } from '@work-boost/data-schemas';

interface FakeDatabaseData {
  users: User[];
  messages: Message[];
  debts: Debt[];
}

function createFakeDatabase(data: FakeDatabaseData): Database {
  const { users, messages, debts } = data;
  const fake: Partial<Database> = {
    async getById(userId) {
      return users.find((user) => user.id === userId) ?? null;
    },
    async listUsers() {
      return [...users];
    },
    async getAllSubscribedUsers() {
      return users.filter((user) => user.subscribed);
    },
    async getMessageById(id) {
      return messages.find((message) => message.id === id) ?? null;
    },
    async getMessagesByUserId(userId) {
      return messages.filter((message) => message.userId === userId);
    },
    async getDebtById(debtId) {
      return debts.find((debt) => debt.id === debtId) ?? null;
    },
    async getDebtsByUserIdFiltered(userId, options) {
      return debts.filter((debt) => {
        if (debt.userId !== userId) return false;
        if (options.status && debt.status !== options.status) return false;
        if (options.direction && debt.direction !== options.direction) return false;
        if (
          options.personName &&
          !debt.personName.toLowerCase().includes(options.personName.toLowerCase())
        ) {
          return false;
        }
        return true;
      });
    },
    async createDebt(input) {
      const debt: Debt = {
        ...input,
        id: `debt-${debts.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      debts.push(debt);
      return debt;
    },
    async settleDebt(debtId) {
      const debt = debts.find((entry) => entry.id === debtId);
      if (!debt) return null;
      debt.status = DebtStatus.PAID;
      return debt;
    },
    async updateDebt(debtId, updates) {
      const debt = debts.find((entry) => entry.id === debtId);
      if (!debt) return null;
      Object.assign(debt, updates);
      return debt;
    },
    async deleteDebt(debtId) {
      const index = debts.findIndex((entry) => entry.id === debtId);
      if (index === -1) return false;
      debts.splice(index, 1);
      return true;
    },
  };
  return fake as unknown as Database;
}

function sampleData(): FakeDatabaseData {
  return {
    users: [
      { id: 'u1', username: 'Alice', subscribed: true },
      { id: 'u2', username: 'Bob', subscribed: false },
    ],
    messages: [
      { id: 'msg-1', userId: 'u1', content: 'plain message', date: new Date() },
      {
        id: 'task-1',
        userId: 'u1',
        content: 'task message',
        date: new Date(),
        status: 'todo',
        title: 'Improve search',
      } as unknown as Message,
      {
        id: 'task-2',
        userId: 'u1',
        content: 'second task',
        date: new Date(),
        status: 'completed',
        title: 'Ship UI',
      } as unknown as Message,
    ],
    debts: [
      {
        id: 'debt-1',
        userId: 'u1',
        direction: DebtDirection.LENT,
        amount: 100,
        currency: 'USD',
        personName: 'Charlie',
        status: DebtStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };
}

function textOf(result: AgentToolResult<unknown>): string {
  const textBlock = result.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

Deno.test('query_user returns a user by id', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryUserTool(db).execute('call_1', { userId: 'u1' });
  const data = (result.details as { data: User | null }).data;
  assertEquals(data?.username, 'Alice');
});

Deno.test('query_user reports a missing user', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryUserTool(db).execute('call_1', { userId: 'nope' });
  assertEquals((result.details as { data: User | null }).data, null);
  assertEquals(textOf(result), 'User not found');
});

Deno.test('query_user reports a subscription filter mismatch', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryUserTool(db).execute('call_1', {
    userId: 'u2',
    subscribed: true,
  });
  assertEquals((result.details as { data: User | null }).data, null);
  assertEquals(textOf(result), 'User found but does not match subscription filter');
});

Deno.test('query_user searches by username case-insensitively', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryUserTool(db).execute('call_1', { username: 'aLi' });
  const data = (result.details as { data: User[] }).data;
  assertEquals(data.length, 1);
  assertEquals(data[0].id, 'u1');
});

Deno.test('query_user lists subscribed users', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryUserTool(db).execute('call_1', { subscribed: true });
  const data = (result.details as { data: User[] }).data;
  assertEquals(data.length, 1);
  assertEquals(data[0].username, 'Alice');
});

Deno.test('query_user throws without any identifier', async () => {
  const db = createFakeDatabase(sampleData());
  await assertRejects(
    () => createQueryUserTool(db).execute('call_1', {}),
    Error,
    /Must specify userId or username/,
  );
});

Deno.test('query_task returns a task by id', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryTaskTool(db).execute('call_1', { taskId: 'task-1' });
  const data = (result.details as { data: { title: string } | null }).data;
  assertEquals(data?.title, 'Improve search');
});

Deno.test('query_task reports a missing task', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryTaskTool(db).execute('call_1', { taskId: 'nope' });
  assertEquals((result.details as { data: unknown }).data, null);
  assertEquals(textOf(result), 'Task not found');
});

Deno.test('query_task filters by user and status', async () => {
  const db = createFakeDatabase(sampleData());
  const todo = await createQueryTaskTool(db).execute('call_1', { userId: 'u1', status: 'todo' });
  assertEquals((todo.details as { data: unknown[] }).data.length, 1);
  const completed = await createQueryTaskTool(db).execute('call_1', {
    userId: 'u1',
    status: 'completed',
  });
  assertEquals((completed.details as { data: unknown[] }).data.length, 1);
});

Deno.test('query_task limits results', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryTaskTool(db).execute('call_1', { userId: 'u1', limit: 1 });
  assertEquals((result.details as { data: unknown[] }).data.length, 1);
});

Deno.test('query_task throws without any identifier', async () => {
  const db = createFakeDatabase(sampleData());
  await assertRejects(
    () => createQueryTaskTool(db).execute('call_1', {}),
    Error,
    /Must specify taskId or userId/,
  );
});

Deno.test('query_debt returns a debt by id', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryDebtTool(db).execute('call_1', { debtId: 'debt-1' });
  const data = (result.details as { data: Debt | null }).data;
  assertEquals(data?.personName, 'Charlie');
});

Deno.test('query_debt filters by user with direction, status, and person name', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createQueryDebtTool(db).execute('call_1', {
    userId: 'u1',
    direction: 'lent',
    status: 'pending',
    personName: 'char',
  });
  const data = (result.details as { data: Debt[] }).data;
  assertEquals(data.length, 1);
  assertEquals(data[0].id, 'debt-1');
});

Deno.test('query_debt throws without any identifier', async () => {
  const db = createFakeDatabase(sampleData());
  await assertRejects(
    () => createQueryDebtTool(db).execute('call_1', {}),
    Error,
    /Must specify debtId or userId/,
  );
});

Deno.test('create_debt defaults currency and status', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createCreateDebtTool(db).execute('call_1', {
    userId: 'u1',
    direction: 'lent',
    amount: 50,
    personName: 'Dave',
  });
  const data = (result.details as { data: Debt }).data;
  assertEquals(data.currency, 'USD');
  assertEquals(data.status, DebtStatus.PENDING);
  assertEquals(data.direction, DebtDirection.LENT);
  assertEquals(textOf(result), `Debt created with ID: ${data.id}`);
});

Deno.test('update_debt settles the debt when status is paid', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createUpdateDebtTool(db).execute('call_1', {
    debtId: 'debt-1',
    status: 'paid',
  });
  const data = (result.details as { data: Debt }).data;
  assertEquals(data.status, DebtStatus.PAID);
  assertEquals(textOf(result), 'Debt debt-1 marked as paid');
});

Deno.test('update_debt updates fields for other changes', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createUpdateDebtTool(db).execute('call_1', {
    debtId: 'debt-1',
    amount: 200,
    reason: 'new reason',
  });
  const data = (result.details as { data: Debt }).data;
  assertEquals(data.amount, 200);
  assertEquals(data.reason, 'new reason');
  assertEquals(textOf(result), 'Debt debt-1 updated');
});

Deno.test('update_debt throws when the debt is not found', async () => {
  const db = createFakeDatabase(sampleData());
  await assertRejects(
    () => createUpdateDebtTool(db).execute('call_1', { debtId: 'nope', status: 'paid' }),
    Error,
    /not found/,
  );
  await assertRejects(
    () => createUpdateDebtTool(db).execute('call_1', { debtId: 'nope', amount: 1 }),
    Error,
    /not found/,
  );
});

Deno.test('delete_debt removes the debt', async () => {
  const db = createFakeDatabase(sampleData());
  const result = await createDeleteDebtTool(db).execute('call_1', { debtId: 'debt-1' });
  assertEquals(textOf(result), 'Debt debt-1 deleted');
  const query = await createQueryDebtTool(db).execute('call_1', { debtId: 'debt-1' });
  assertEquals((query.details as { data: Debt | null }).data, null);
});

Deno.test('delete_debt throws when the debt is not found', async () => {
  const db = createFakeDatabase(sampleData());
  await assertRejects(
    () => createDeleteDebtTool(db).execute('call_1', { debtId: 'nope' }),
    Error,
    /not found/,
  );
});

Deno.test('getDatabaseTools returns all six tools', () => {
  const db = createFakeDatabase(sampleData());
  const names = getDatabaseTools(db).map((tool) => tool.name);
  assertEquals(names, [
    'query_user',
    'query_task',
    'query_debt',
    'create_debt',
    'update_debt',
    'delete_debt',
  ]);
});
