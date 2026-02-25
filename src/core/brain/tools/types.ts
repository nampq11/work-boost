/**
 * Tools Types
 *
 * Shared types for tools module.
 */

import type { Debt, DebtDirection, DebtStatus } from '../../entity/debt.ts';
import type { Message, Task } from '../../entity/task.ts';
import type { User } from '../../entity/user.ts';
import type { Tool } from '../types.ts';

// Re-export Tool type for convenience
export type { Tool };

/**
 * Query parameters for user lookups
 */
export interface QueryUserParams {
  /** User ID to look up */
  userId?: string;

  /** Username to search for */
  username?: string;

  /** Filter by subscription status */
  subscribed?: boolean;
}

/**
 * Query parameters for task lookups
 */
export interface QueryTaskParams {
  /** Task ID to look up */
  taskId?: string;

  /** User ID who created the task */
  userId?: string;

  /** Filter by status */
  status?: string;

  /** Limit results */
  limit?: number;
}

/**
 * Query parameters for debt lookups
 */
export interface QueryDebtParams {
  /** Debt ID to look up */
  debtId?: string;

  /** User ID */
  userId?: string;

  /** Filter by direction */
  direction?: DebtDirection;

  /** Filter by status */
  status?: DebtStatus;

  /** Filter by person name (partial match) */
  personName?: string;

  /** Limit results */
  limit?: number;
}

/**
 * Parameters for creating a debt
 */
export interface CreateDebtParams {
  /** User ID creating the debt */
  userId: string;

  /** Direction: lent or borrowed */
  direction: DebtDirection;

  /** Amount */
  amount: number;

  /** Currency code (default: USD) */
  currency?: string;

  /** Person's name */
  personName: string;

  /** Optional reason */
  reason?: string;
}

/**
 * Parameters for updating a debt
 */
export interface UpdateDebtParams {
  /** Debt ID to update */
  debtId: string;

  /** New status */
  status?: DebtStatus;

  /** New amount */
  amount?: number;

  /** New reason */
  reason?: string;
}

/**
 * Parameters for creating a task
 */
export interface CreateTaskParams {
  /** User ID creating the task */
  userId: string;

  /** Task title */
  title: string;

  /** Task status */
  status?: string;

  /** Due date */
  dueDate?: Date;

  /** Task priority */
  priority?: number;

  /** Tags */
  tags?: string[];
}

/**
 * Parameters for updating a task
 */
export interface UpdateTaskParams {
  /** Task ID to update */
  taskId: string;

  /** New title */
  title?: string;

  /** New status */
  status?: string;

  /** New due date */
  dueDate?: Date;

  /** New priority */
  priority?: number;

  /** Tags to add */
  addTags?: string[];

  /** Tags to remove */
  removeTags?: string[];
}
