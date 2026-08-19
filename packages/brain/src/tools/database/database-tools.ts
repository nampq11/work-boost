/**
 * Database Tools
 *
 * Tools for querying and manipulating database entities, wired into the pi
 * agent loop. Execute throws on failure (the agent loop turns a thrown error
 * into an error tool result); success returns a text block with the data JSON
 * plus the raw data in `details` for logs.
 */

import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { type TSchema as SchemaType, StringEnum, Type } from '@earendil-works/pi-ai';
import type { Database } from '@work-boost/data-provider';
import { DebtStatus } from '@work-boost/data-schemas';
import type { DebtDirection, Task } from '@work-boost/data-schemas';

/**
 * Build a successful tool result carrying both the JSON text the model sees
 * and the structured data for logs.
 */
function successResult(data: unknown, message?: string): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text: message ?? JSON.stringify(data) }],
    details: { data, message },
  };
}

const queryUserParams = Type.Object({
  userId: Type.Optional(Type.String({ description: 'The user ID to look up' })),
  username: Type.Optional(Type.String({ description: 'The username to search for' })),
  subscribed: Type.Optional(Type.Boolean({ description: 'Filter by subscription status' })),
});

/**
 * Create a query_user tool
 * Queries user information from the database
 */
export function createQueryUserTool(db: Database): AgentTool<typeof queryUserParams> {
  return {
    name: 'query_user',
    label: 'Query User',
    description:
      'Query user information from the database. Use this to look up user details, subscription status, etc.',
    parameters: queryUserParams,
    execute: async (_toolCallId, params) => {
      const { userId, username, subscribed } = params;

      if (userId) {
        const user = await db.getById(userId);
        if (user && (subscribed === undefined || user.subscribed === subscribed)) {
          return successResult(user);
        }
        return successResult(
          null,
          subscribed !== undefined && user?.subscribed !== subscribed
            ? 'User found but does not match subscription filter'
            : 'User not found',
        );
      }

      if (username) {
        const users = await db.listUsers();
        const filteredUsers = users.filter(
          (user) =>
            user.username.toLowerCase().includes(username.toLowerCase()) &&
            (subscribed === undefined || user.subscribed === subscribed),
        );
        return successResult(filteredUsers);
      }

      if (subscribed !== undefined) {
        const users = subscribed ? await db.getAllSubscribedUsers() : [];
        return successResult(users);
      }

      throw new Error('Must specify userId or username');
    },
  };
}

const queryTaskParams = Type.Object({
  taskId: Type.Optional(Type.String({ description: 'The task ID to look up' })),
  userId: Type.Optional(Type.String({ description: 'The user ID who created the task' })),
  status: Type.Optional(
    Type.String({ description: 'Filter by task status (e.g., todo, in_progress, completed)' }),
  ),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of results to return' })),
});

/**
 * Create a query_task tool
 * Queries task information from the database
 */
export function createQueryTaskTool(db: Database): AgentTool<typeof queryTaskParams> {
  return {
    name: 'query_task',
    label: 'Query Task',
    description:
      'Query task information from the database. Use this to look up tasks by user, status, or task ID.',
    parameters: queryTaskParams,
    execute: async (_toolCallId, params) => {
      const { taskId, userId, status, limit = 50 } = params;

      if (taskId) {
        // Tasks are stored in messages for now
        const message = await db.getMessageById(taskId);
        const task =
          message && 'status' in message && 'title' in message
            ? (message as unknown as Task)
            : null;

        if (!task) {
          return successResult(null, 'Task not found');
        }
        return successResult(task);
      }

      if (userId) {
        // Messages (which include tasks) for user
        const messages = await db.getMessagesByUserId(userId);
        let tasks = messages.filter((m) => 'status' in m && 'title' in m) as unknown as Task[];

        if (status) {
          tasks = tasks.filter((task) => task.status === status);
        }

        return successResult(tasks.slice(0, limit));
      }

      throw new Error('Must specify taskId or userId');
    },
  };
}

const queryDebtParams = Type.Object({
  debtId: Type.Optional(Type.String({ description: 'The debt ID to look up' })),
  userId: Type.Optional(Type.String({ description: 'The user ID' })),
  direction: Type.Optional(
    StringEnum(['lent', 'borrowed'], { description: 'Filter by debt direction' }),
  ),
  status: Type.Optional(
    StringEnum(['pending', 'paid', 'cancelled'], { description: 'Filter by debt status' }),
  ),
  personName: Type.Optional(Type.String({ description: 'Filter by person name (partial match)' })),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of results' })),
});

/**
 * Create a query_debt tool
 * Queries debt information from the database
 */
export function createQueryDebtTool(db: Database): AgentTool<typeof queryDebtParams> {
  return {
    name: 'query_debt',
    label: 'Query Debt',
    description:
      'Query debt information from the database. Use this to look up debts by user, status, direction, or person.',
    parameters: queryDebtParams,
    execute: async (_toolCallId, params) => {
      const { debtId, userId, direction, status, personName, limit = 50 } = params;

      if (debtId) {
        const debt = await db.getDebtById(debtId);
        return successResult(debt);
      }

      if (userId) {
        const debts = await db.getDebtsByUserIdFiltered(userId, {
          direction: direction as DebtDirection | undefined,
          status: status as DebtStatus | undefined,
          personName,
        });
        return successResult(debts.slice(0, limit));
      }

      throw new Error('Must specify debtId or userId');
    },
  };
}

const createDebtParams = Type.Object({
  userId: Type.String({ description: 'The user ID creating the debt' }),
  direction: StringEnum(['lent', 'borrowed'], {
    description: 'Direction: money lent or borrowed',
  }),
  amount: Type.Number({ description: 'The amount of money' }),
  currency: Type.Optional(Type.String({ description: 'Currency code (default: USD)' })),
  personName: Type.String({ description: 'Name of the person involved' }),
  reason: Type.Optional(Type.String({ description: 'Optional reason for the debt' })),
});

/**
 * Create a create_debt tool
 * Creates a new debt record
 */
export function createCreateDebtTool(db: Database): AgentTool<typeof createDebtParams> {
  return {
    name: 'create_debt',
    label: 'Create Debt',
    description:
      'Create a new debt record. Use this after parsing a debt entry from natural language.',
    parameters: createDebtParams,
    execute: async (_toolCallId, params) => {
      const { userId, direction, amount, currency = 'USD', personName, reason } = params;

      const debt = await db.createDebt({
        userId,
        direction: direction as DebtDirection,
        amount,
        currency,
        personName,
        reason,
        status: DebtStatus.PENDING,
      });

      return successResult(debt, `Debt created with ID: ${debt.id}`);
    },
  };
}

const updateDebtParams = Type.Object({
  debtId: Type.String({ description: 'The debt ID to update' }),
  status: Type.Optional(
    StringEnum(['pending', 'paid', 'cancelled'], { description: 'New debt status' }),
  ),
  amount: Type.Optional(Type.Number({ description: 'New amount' })),
  reason: Type.Optional(Type.String({ description: 'New reason' })),
});

/**
 * Create an update_debt tool
 * Updates an existing debt record
 */
export function createUpdateDebtTool(db: Database): AgentTool<typeof updateDebtParams> {
  return {
    name: 'update_debt',
    label: 'Update Debt',
    description: 'Update an existing debt record. Can change status, amount, or reason.',
    parameters: updateDebtParams,
    execute: async (_toolCallId, params) => {
      const { debtId, status, amount, reason } = params;

      if (status === 'paid') {
        // Settling also records the paid date, which updateDebt cannot
        const debt = await db.settleDebt(debtId);
        if (!debt) {
          throw new Error(`Debt ${debtId} not found`);
        }
        return successResult(debt, `Debt ${debtId} marked as paid`);
      }

      const debt = await db.updateDebt(debtId, {
        status: status as DebtStatus | undefined,
        amount,
        reason,
      });

      if (!debt) {
        throw new Error(`Debt ${debtId} not found`);
      }

      return successResult(debt, `Debt ${debtId} updated`);
    },
  };
}

const deleteDebtParams = Type.Object({
  debtId: Type.String({ description: 'The debt ID to delete' }),
});

/**
 * Create a delete_debt tool
 * Deletes a debt record
 */
export function createDeleteDebtTool(db: Database): AgentTool<typeof deleteDebtParams> {
  return {
    name: 'delete_debt',
    label: 'Delete Debt',
    description: 'Delete a debt record permanently. Use with caution.',
    parameters: deleteDebtParams,
    execute: async (_toolCallId, params) => {
      const { debtId } = params;
      const deleted = await db.deleteDebt(debtId);

      if (!deleted) {
        throw new Error(`Debt ${debtId} not found`);
      }

      return successResult({ debtId }, `Debt ${debtId} deleted`);
    },
  };
}

/**
 * Get all database access tools
 */
export function getDatabaseTools(db: Database): AgentTool<SchemaType>[] {
  return [
    createQueryUserTool(db),
    createQueryTaskTool(db),
    createQueryDebtTool(db),
    createCreateDebtTool(db),
    createUpdateDebtTool(db),
    createDeleteDebtTool(db),
  ];
}
