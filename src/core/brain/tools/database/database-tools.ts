/**
 * Database Tools
 *
 * Tools for querying and manipulating database entities.
 * These enable the agent to access and modify stored data.
 */

import type { Database } from '../../../storage/database.ts';
import { DebtStatus } from '../../../entity/debt.ts';
import type { Task } from '../../../entity/task.ts';
import type { User } from '../../../entity/user.ts';
import type { Tool } from '../../types.ts';
import type {
  CreateDebtParams,
  QueryDebtParams,
  QueryTaskParams,
  QueryUserParams,
  UpdateDebtParams,
} from './types.ts';

/**
 * Create a query_user tool
 * Queries user information from the database
 */
export function createQueryUserTool(db: Database): Tool {
  return {
    name: 'query_user',
    description: 'Query user information from the database. Use this to look up user details, subscription status, etc.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The user ID to look up',
        },
        username: {
          type: 'string',
          description: 'The username to search for',
        },
        subscribed: {
          type: 'boolean',
          description: 'Filter by subscription status',
        },
      },
    },
    execute: async (params: unknown) => {
      const { userId, username, subscribed } = params as QueryUserParams;

      try {
        if (userId) {
          const user = await db.getById(userId);
          if (user && (subscribed === undefined || user.subscribed === subscribed)) {
            return {
              success: true,
              data: user,
            };
          }
          return {
            success: true,
            data: null,
            message: subscribed !== undefined && user?.subscribed !== subscribed
              ? 'User found but does not match subscription filter'
              : 'User not found',
          };
        }

        if (username) {
          const users: User[] = [];
          const entries = db.kv.list({ prefix: ['users'] });
          for await (const entry of entries) {
            const user = entry.value as User;
            if (user.username.toLowerCase().includes(username.toLowerCase())) {
              if (subscribed === undefined || user.subscribed === subscribed) {
                users.push(user);
              }
            }
          }
          return {
            success: true,
            data: users,
            count: users.length,
          };
        }

        // If subscribed is specified without userId or username, get all subscribed users
        if (subscribed !== undefined) {
          const users = subscribed ? await db.getAllSubscribedUsers() : [];
          return {
            success: true,
            data: users,
            count: users.length,
          };
        }

        return {
          success: false,
          error: 'Must specify userId or username',
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Create a query_task tool
 * Queries task information from the database
 */
export function createQueryTaskTool(db: Database): Tool {
  return {
    name: 'query_task',
    description: 'Query task information from the database. Use this to look up tasks by user, status, or task ID.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to look up',
        },
        userId: {
          type: 'string',
          description: 'The user ID who created the task',
        },
        status: {
          type: 'string',
          description: 'Filter by task status (e.g., todo, in_progress, completed)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
        },
      },
    },
    execute: async (params: unknown) => {
      const { taskId, userId, status, limit = 50 } = params as QueryTaskParams;

      try {
        if (taskId) {
          // Look up specific task - note: tasks are stored in messages for now
          const result = await db.kv.get(['messages', taskId]);
          const task = result.value as Task | null;
          return {
            success: true,
            data: task,
          };
        }

        if (userId) {
          // Get messages (which include tasks) for user
          const messages = await db.getMessagesByUserId(userId);
          let tasks = messages.filter((m) =>
            'status' in m && 'title' in m
          ) as unknown as Task[];

          if (status) {
            tasks = tasks.filter((t) => t.status === status);
          }

          return {
            success: true,
            data: tasks.slice(0, limit),
            count: tasks.length,
          };
        }

        return {
          success: false,
          error: 'Must specify taskId or userId',
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Create a query_debt tool
 * Queries debt information from the database
 */
export function createQueryDebtTool(db: Database): Tool {
  return {
    name: 'query_debt',
    description: 'Query debt information from the database. Use this to look up debts by user, status, direction, or person.',
    parameters: {
      type: 'object',
      properties: {
        debtId: {
          type: 'string',
          description: 'The debt ID to look up',
        },
        userId: {
          type: 'string',
          description: 'The user ID',
        },
        direction: {
          type: 'string',
          enum: ['lent', 'borrowed'],
          description: 'Filter by debt direction',
        },
        status: {
          type: 'string',
          enum: ['pending', 'paid', 'cancelled'],
          description: 'Filter by debt status',
        },
        personName: {
          type: 'string',
          description: 'Filter by person name (partial match)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
        },
      },
    },
    execute: async (params: unknown) => {
      const { debtId, userId, direction, status, personName, limit = 50 } = params as QueryDebtParams;

      try {
        if (debtId) {
          const debt = await db.getDebtById(debtId);
          return {
            success: true,
            data: debt,
          };
        }

        if (userId) {
          const debts = await db.getDebtsByUserIdFiltered(userId, {
            direction,
            status,
            personName,
          });

          return {
            success: true,
            data: debts.slice(0, limit),
            count: debts.length,
          };
        }

        return {
          success: false,
          error: 'Must specify debtId or userId',
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Create a create_debt tool
 * Creates a new debt record
 */
export function createCreateDebtTool(db: Database): Tool {
  return {
    name: 'create_debt',
    description: 'Create a new debt record. Use this after parsing a debt entry from natural language.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The user ID creating the debt',
        },
        direction: {
          type: 'string',
          enum: ['lent', 'borrowed'],
          description: 'Direction: money lent or borrowed',
        },
        amount: {
          type: 'number',
          description: 'The amount of money',
        },
        currency: {
          type: 'string',
          description: 'Currency code (default: USD)',
        },
        personName: {
          type: 'string',
          description: 'Name of the person involved',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for the debt',
        },
      },
      required: ['userId', 'direction', 'amount', 'personName'],
    },
    execute: async (params: unknown) => {
      const { userId, direction, amount, currency = 'USD', personName, reason } =
        params as CreateDebtParams;

      try {
        const debt = await db.createDebt({
          userId,
          direction,
          amount,
          currency,
          personName,
          reason,
          status: DebtStatus.PENDING,
        });

        return {
          success: true,
          data: debt,
          message: `Debt created with ID: ${debt.id}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Create an update_debt tool
 * Updates an existing debt record
 */
export function createUpdateDebtTool(db: Database): Tool {
  return {
    name: 'update_debt',
    description: 'Update an existing debt record. Can change status, amount, or reason.',
    parameters: {
      type: 'object',
      properties: {
        debtId: {
          type: 'string',
          description: 'The debt ID to update',
        },
        status: {
          type: 'string',
          enum: ['pending', 'paid', 'cancelled'],
          description: 'New debt status',
        },
        amount: {
          type: 'number',
          description: 'New amount',
        },
        reason: {
          type: 'string',
          description: 'New reason',
        },
      },
      required: ['debtId'],
    },
    execute: async (params: unknown) => {
      const { debtId, status, amount, reason } = params as UpdateDebtParams;

      try {
        if (status === 'paid') {
          // Use settleDebt for marking as paid
          const debt = await db.settleDebt(debtId);
          return {
            success: true,
            data: debt,
            message: `Debt ${debtId} marked as paid`,
          };
        }

        const debt = await db.updateDebt(debtId, { status, amount, reason });

        if (!debt) {
          return {
            success: false,
            error: `Debt ${debtId} not found`,
          };
        }

        return {
          success: true,
          data: debt,
          message: `Debt ${debtId} updated`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Create a delete_debt tool
 * Deletes a debt record
 */
export function createDeleteDebtTool(db: Database): Tool {
  return {
    name: 'delete_debt',
    description: 'Delete a debt record permanently. Use with caution.',
    parameters: {
      type: 'object',
      properties: {
        debtId: {
          type: 'string',
          description: 'The debt ID to delete',
        },
      },
      required: ['debtId'],
    },
    execute: async (params: unknown) => {
      const { debtId } = params as { debtId: string };

      try {
        const deleted = await db.deleteDebt(debtId);

        if (!deleted) {
          return {
            success: false,
            error: `Debt ${debtId} not found`,
          };
        }

        return {
          success: true,
          message: `Debt ${debtId} deleted`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Get all database access tools
 */
export function getDatabaseTools(db: Database): Tool[] {
  return [
    createQueryUserTool(db),
    createQueryTaskTool(db),
    createQueryDebtTool(db),
    createCreateDebtTool(db),
    createUpdateDebtTool(db),
    createDeleteDebtTool(db),
  ];
}
