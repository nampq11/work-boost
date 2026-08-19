/**
 * Debt tracking entity for managing money lent to or borrowed from friends
 */

/**
 * Direction of the debt flow
 */
export enum DebtDirection {
  /** Money you lent to someone (they owe you) */
  LENT = 'lent',
  /** Money you borrowed from someone (you owe them) */
  BORROWED = 'borrowed',
}

/**
 * Current status of a debt record
 */
export enum DebtStatus {
  /** Debt is active and unpaid */
  PENDING = 'pending',
  /** Debt has been fully paid/settled */
  PAID = 'paid',
  /** Debt record was cancelled/voided */
  CANCELLED = 'cancelled',
}

/**
 * Debt record interface
 */
export interface Debt {
  /** Unique identifier for this debt */
  id: string;

  /** User ID who created this debt record */
  userId: string;

  /** Direction: money lent or borrowed */
  direction: DebtDirection;

  /** Amount of money */
  amount: number;

  /** Currency code (default: USD) */
  currency: string;

  /** Name of the person involved */
  personName: string;

  /** Optional reason/note for the debt */
  reason?: string;

  /** Current status */
  status: DebtStatus;

  /** When the debt was created */
  createdAt: Date;

  /** Optional date when the debt occurred (defaults to createdAt) */
  debtDate?: Date;

  /** When the debt was marked as paid */
  paidAt?: Date;

  /** When the debt was last updated */
  updatedAt: Date;
}

/**
 * Reminder settings for debt notifications
 */
export interface DebtReminderSettings {
  /** User ID for these settings */
  userId: string;

  /** Whether reminders are enabled */
  enabled: boolean;

  /** Frequency: 'weekly', 'monthly', or 'never' */
  frequency: 'weekly' | 'monthly' | 'never';

  /** Day of week for weekly reminders (1-7, Monday-Sunday) */
  weeklyDay?: number;

  /** Day of month for monthly reminders (1-28) */
  monthlyDay?: number;

  /** Hour of day to send reminder (0-23) */
  reminderHour: number;

  /** Last time a reminder was sent */
  lastReminderSentAt?: Date;

  /** When these settings were created/updated */
  updatedAt: Date;
}

/**
 * Filter options for listing debts
 */
export interface DebtFilterOptions {
  /** Filter by status */
  status?: DebtStatus;

  /** Filter by direction */
  direction?: DebtDirection;

  /** Filter by person name (partial match) */
  personName?: string;

  /** Limit results */
  limit?: number;
}

/**
 * Parsed debt entry from natural language input
 */
export interface ParsedDebtEntry {
  /** Direction: lent or borrowed */
  direction: DebtDirection;

  /** Amount extracted */
  amount: number;

  /** Person's name */
  person: string;

  /** Reason for the debt */
  reason?: string;

  /** Currency (default USD) */
  currency?: string;
}

import { z } from 'zod';

/**
 * Zod schema for debt document frontmatter (markdown storage)
 */
export const DebtFrontmatterSchema = z.object({
  id: z.string().uuid(),
  direction: z.nativeEnum(DebtDirection),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  personName: z.string().min(1),
  status: z.nativeEnum(DebtStatus).default(DebtStatus.PENDING),
  debtDate: z.string(), // YYYY-MM-DD
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable().default(null),
});

export type DebtFrontmatter = z.infer<typeof DebtFrontmatterSchema>;

/**
 * Debt document interface for markdown storage
 */
export interface DebtDocument {
  frontmatter: DebtFrontmatter;
  reason: string; // Debt reason stored in markdown body
  filePath: string;
}

/**
 * Debt summary statistics
 */
export interface DebtSummary {
  totalLent: number;
  totalBorrowed: number;
  pendingLentCount: number;
  pendingBorrowedCount: number;
  netPosition: number;
  currencies: Record<string, { lent: number; borrowed: number }>;
}
