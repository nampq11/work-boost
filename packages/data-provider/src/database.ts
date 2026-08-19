/// <reference lib="deno.unstable" />
import { Debt, DebtDirection, DebtReminderSettings, DebtStatus } from '@work-boost/data-schemas';
import { Subscription } from '@work-boost/data-schemas';
import { Message } from '@work-boost/data-schemas';
import { User } from '@work-boost/data-schemas';
import { IndexKeys, listIndexed, PrimaryKeys } from './indexes.ts';
import { createDataLayer } from '../mod.ts';
import { WorkspaceConfig } from '@work-boost/data-schemas/config.ts';
import type { ConfigManager, DailyWorkRepository, DebtRepository } from '../mod.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { parseMarkdown } from './markdown/markdown-engine.ts';

/**
 * Single-user workspace user ID for backward compatibility
 */
const SINGLE_USER_ID = 'workspace-user';

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * Convert Date to ISO string for markdown storage
 */
function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Convert ISO string to Date for backward compatibility
 */
function toDate(isoString: string): Date {
  return new Date(isoString);
}

function toDebt(document: DebtDocument): Debt {
  const { frontmatter, reason } = document;
  return {
    id: frontmatter.id,
    userId: SINGLE_USER_ID,
    direction: frontmatter.direction,
    amount: frontmatter.amount,
    currency: frontmatter.currency,
    personName: frontmatter.personName,
    reason,
    status: frontmatter.status,
    debtDate: new Date(frontmatter.debtDate),
    paidAt: frontmatter.paidAt ? toDate(frontmatter.paidAt) : undefined,
    createdAt: toDate(frontmatter.createdAt),
    updatedAt: toDate(frontmatter.updatedAt),
  };
}

function getDailyWorkContent(document: { rawMarkdown: string }): string {
  return parseMarkdown<unknown>(document.rawMarkdown).body;
}

export class Database {
  private static instance: Database;
  private _kv: Deno.Kv | null = null;

  // New markdown-based repositories (Phase 1: Local-First Architecture)
  private config: ConfigManager;
  private dailyWork: DailyWorkRepository;
  private debts: DebtRepository;

  private constructor(
    dataLayer: { config: ConfigManager; dailyWork: DailyWorkRepository; debts: DebtRepository },
    kv?: Deno.Kv,
  ) {
    this.config = dataLayer.config;
    this.dailyWork = dataLayer.dailyWork;
    this.debts = dataLayer.debts;
    this._kv = kv || null; // Keep KV for backward compatibility during transition
  }

  /**
   * Initialize database with markdown-based storage (Phase 1: Local-First Architecture)
   * Falls back to KV for backward compatibility if needed
   */
  static async init(): Promise<Database> {
    if (this.instance) return this.instance;

    try {
      // Initialize new markdown-based data layer
      const dataLayer = createDataLayer();
      await dataLayer.fs.init();

      // Load workspace config
      await dataLayer.config.load();

      this.instance = new Database(dataLayer);
      return this.instance;
    } catch (error) {
      console.error('Failed to initialize markdown storage, falling back to KV:', error);
      // Fallback to KV for backward compatibility
      const kv = await Deno.openKv();
      const dataLayer = createDataLayer();
      this.instance = new Database(dataLayer, kv);
      return this.instance;
    }
  }

  /**
   * Create a test database instance with a provided KV store.
   * This is only intended for testing purposes.
   */
  static async createForTest(kv?: Deno.Kv): Promise<Database> {
    const testKv = kv || (await Deno.openKv(':memory:'));
    const dataLayer = createDataLayer();
    return new Database(dataLayer, testKv);
  }

  get kv(): Deno.Kv | null {
    return this._kv;
  }

  async close(): Promise<void> {
    if (this._kv) {
      await this._kv.close();
    }
  }

  // User methods - Updated for single-user system (Phase 1: Local-First Architecture)

  /**
   * Get single workspace user (backward compatibility)
   * In single-user system, always returns the workspace user
   */
  async store(user: User): Promise<void> {
    // For single-user system, store workspace config instead
    const config = await this.config.load();
    // Update workspace name if provided
    if (user.name && config.workspaceName !== user.name) {
      config.workspaceName = user.name;
      await this.config.save(config);
    }
  }

  /**
   * Get single workspace user (backward compatibility)
   * In single-user system, always returns the workspace user
   */
  async getById(id: string): Promise<User | null> {
    const config = await this.config.load();

    // Return single workspace user (User schema has username, not name)
    return {
      id: SINGLE_USER_ID,
      username: config.workspaceName,
      subscribed: true, // Always subscribed in single-user system
    };
  }

  /**
   * Get all subscribed users (backward compatibility)
   * In single-user system, always returns the workspace user
   */
  async getAllSubscribedUsers(): Promise<User[]> {
    const user = await this.getById(SINGLE_USER_ID);
    return user ? [user] : [];
  }

  /**
   * Delete user (backward compatibility - not applicable in single-user system)
   */
  async delete(id: string): Promise<void> {
    // Not applicable in single-user system
    // Workspace cannot be deleted through this method
  }

  /**
   * List users (backward compatibility)
   * In single-user system, always returns the workspace user
   */
  async listUsers(): Promise<User[]> {
    const user = await this.getById(SINGLE_USER_ID);
    return user ? [user] : [];
  }

  // Daily work methods - Updated to use markdown storage (Phase 1: Local-First Architecture)

  /**
   * Store daily work message using markdown storage
   * Note: Message interface has been simplified - stores content as formatted markdown
   */
  async storeDailyWorkMessage(message: Message): Promise<void> {
    const dateStr = message.date.toISOString().split('T')[0]; // YYYY-MM-DD

    await this.dailyWork.saveContent(dateStr, message.content);
  }

  /**
   * Get daily work for a specific date using markdown storage
   */
  async getDailyWork(userId: string, date: Date): Promise<Message | undefined> {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const doc = await this.dailyWork.get(dateStr);

    if (!doc) return undefined;

    return {
      id: doc.frontmatter.id,
      userId: SINGLE_USER_ID,
      date: new Date(doc.frontmatter.date),
      content: getDailyWorkContent(doc),
    };
  }

  // Subscription methods - Updated to use workspace config (Phase 1: Local-First Architecture)

  /**
   * Get subscription for user (backward compatibility)
   * In single-user system, converts workspace config to subscription format
   */
  async getSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    const config = await this.config.load();

    // Convert workspace config to subscription format for backward compatibility
    const enabled: Array<'slack' | 'telegram'> = [];
    if (config.platforms.slack.enabled) enabled.push('slack');
    if (config.platforms.telegram.enabled) enabled.push('telegram');

    return {
      userId: SINGLE_USER_ID,
      enabled,
      platforms: {
        slack: config.platforms.slack.channelId || '',
        telegram: config.platforms.telegram.chatId || '',
      },
      subscribedAt: new Date(config.createdAt), // Use workspace creation date
      lastSentAt: config.platforms.slack.channelId ? new Date() : undefined,
    };
  }

  /**
   * Update subscription (backward compatibility)
   * In single-user system, updates workspace config instead
   */
  async upsertSubscription(subscription: Subscription): Promise<void> {
    const config = await this.config.load();

    // Update platform settings from subscription
    config.platforms.slack.enabled = subscription.enabled.includes('slack');
    if (subscription.platforms.slack) {
      config.platforms.slack.channelId = subscription.platforms.slack;
    }

    config.platforms.telegram.enabled = subscription.enabled.includes('telegram');
    if (subscription.platforms.telegram) {
      config.platforms.telegram.chatId = subscription.platforms.telegram;
    }

    await this.config.save(config);
  }

  /**
   * Set platform chat ID (backward compatibility)
   * Updates workspace config instead
   */
  async setPlatformChatId(
    userId: string,
    platform: 'slack' | 'telegram',
    chatId: string,
  ): Promise<void> {
    const config = await this.config.load();

    if (platform === 'slack') {
      config.platforms.slack.channelId = chatId;
      config.platforms.slack.enabled = true;
    } else if (platform === 'telegram') {
      config.platforms.telegram.chatId = chatId;
      config.platforms.telegram.enabled = true;
    }

    await this.config.save(config);
  }

  /**
   * Disable platform (backward compatibility)
   * Updates workspace config instead
   */
  async disablePlatform(userId: string, platform: 'slack' | 'telegram'): Promise<void> {
    const config = await this.config.load();

    if (platform === 'slack') {
      config.platforms.slack.enabled = false;
    } else if (platform === 'telegram') {
      config.platforms.telegram.enabled = false;
    }

    await this.config.save(config);
  }

  /**
   * Get all active subscriptions (backward compatibility)
   * In single-user system, returns workspace user if any platform is enabled
   */
  async getAllActiveSubscriptions(): Promise<Subscription[]> {
    const config = await this.config.load();
    const hasEnabledPlatforms = config.platforms.slack.enabled || config.platforms.telegram.enabled;

    if (!hasEnabledPlatforms) return [];

    const subscription = await this.getSubscriptionByUserId(SINGLE_USER_ID);
    return subscription ? [subscription] : [];
  }

  /**
   * Get messages by user using markdown storage (backward compatibility)
   * Returns all daily work reports sorted by date (oldest first)
   */
  async getMessagesByUserId(userId: string): Promise<Message[]> {
    const dateStrings = await this.dailyWork.listDates();
    const messages: Message[] = [];

    for (const dateStr of dateStrings) {
      const doc = await this.dailyWork.get(dateStr);
      if (doc) {
        messages.push({
          id: doc.frontmatter.id,
          userId: SINGLE_USER_ID,
          date: new Date(doc.frontmatter.date),
          content: getDailyWorkContent(doc),
        });
      }
    }

    return messages.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Get message by ID using markdown storage (backward compatibility)
   */
  async getMessageById(id: string): Promise<Message | null> {
    // Extract date from ID (format: daily_YYYY-MM-DD)
    const match = id.match(/daily_(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;

    const dateStr = match[1];
    const doc = await this.dailyWork.get(dateStr);

    if (!doc) return null;

    return {
      id: doc.frontmatter.id,
      userId: SINGLE_USER_ID,
      date: new Date(doc.frontmatter.date),
      content: getDailyWorkContent(doc),
    };
  }

  /**
   * Get messages since a specific date using markdown storage (backward compatibility)
   */
  async getMessagesByUserIdSince(userId: string, since: Date): Promise<Message[]> {
    const messages = await this.getMessagesByUserId(userId);
    return messages.filter((m) => m.date >= since);
  }

  /**
   * Get messages from today using markdown storage (backward compatibility)
   */
  async getTodayMessagesByUserId(userId: string): Promise<Message[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.getMessagesByUserIdSince(userId, today);
  }

  /**
   * Get messages from last N days using markdown storage (backward compatibility)
   */
  async getRecentMessagesByUserId(userId: string, days = 1): Promise<Message[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.getMessagesByUserIdSince(userId, cutoff);
  }

  /**
   * Update last sent timestamp using workspace config (backward compatibility)
   */
  async updateLastSentAt(userId: string, timestamp: Date): Promise<void> {
    // This was used for subscriptions, now handled in workspace config
    // Not needed in single-user system
  }

  // Debt tracking methods - Updated to use markdown storage (Phase 1: Local-First Architecture)

  /**
   * Create a new debt record using markdown storage
   */
  async createDebt(debt: Omit<Debt, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<Debt> {
    // In single-user system, always use SINGLE_USER_ID
    const newDebt = await this.debts.create({
      direction: debt.direction,
      amount: debt.amount,
      currency: debt.currency,
      personName: debt.personName,
      reason: debt.reason,
      debtDate: debt.debtDate?.toISOString().slice(0, 10),
    });
    return toDebt(newDebt);
  }

  /**
   * Get a debt by its ID using markdown storage
   */
  async getDebtById(id: string): Promise<Debt | null> {
    const debt = await this.debts.getById(id);
    return debt ? toDebt(debt) : null;
  }

  /**
   * Get all debts for workspace user, sorted by creation date (newest first)
   */
  async getDebtsByUserId(userId: string): Promise<Debt[]> {
    // In single-user system, userId is ignored
    const debts = await this.debts.listAll();
    return debts
      .sort((a, b) =>
        new Date(b.frontmatter.createdAt).getTime() - new Date(a.frontmatter.createdAt).getTime()
      )
      .map(toDebt);
  }

  /**
   * Get only unpaid (pending) debts using markdown storage
   */
  async getUnpaidDebtsByUserId(userId: string): Promise<Debt[]> {
    const debts = await this.debts.filter({ status: DebtStatus.PENDING });
    return debts
      .sort((a, b) =>
        new Date(a.frontmatter.createdAt).getTime() - new Date(b.frontmatter.createdAt).getTime()
      )
      .map(toDebt);
  }

  /**
   * Get debts filtered by status, direction, or person using markdown storage
   */
  async getDebtsByUserIdFiltered(
    userId: string,
    options: {
      status?: DebtStatus;
      direction?: DebtDirection;
      personName?: string;
    },
  ): Promise<Debt[]> {
    const debts = await this.debts.filter(options);
    return debts
      .sort((a, b) =>
        new Date(b.frontmatter.createdAt).getTime() - new Date(a.frontmatter.createdAt).getTime()
      )
      .map(toDebt);
  }

  /**
   * Mark a debt as paid (settled) using markdown storage
   */
  async settleDebt(debtId: string): Promise<Debt | null> {
    const updatedDoc = await this.debts.settle(debtId);
    if (!updatedDoc) return null;

    return toDebt(updatedDoc);
  }

  /**
   * Update an existing debt using markdown storage
   */
  async updateDebt(
    debtId: string,
    updates: Partial<Omit<Debt, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Debt | null> {
    const updatedDoc = await this.debts.update(debtId, {
      direction: updates.direction,
      amount: updates.amount,
      currency: updates.currency,
      personName: updates.personName,
      reason: updates.reason,
      status: updates.status,
      ...(updates.debtDate === undefined
        ? {}
        : { debtDate: updates.debtDate.toISOString().slice(0, 10) }),
      ...(updates.paidAt === undefined ? {} : { paidAt: updates.paidAt.toISOString() }),
    });
    return updatedDoc ? toDebt(updatedDoc) : null;
  }

  /**
   * Delete a debt record using markdown storage
   */
  async deleteDebt(debtId: string): Promise<boolean> {
    return await this.debts.delete(debtId);
  }

  /**
   * Get debt reminder settings using workspace config (backward compatibility)
   */
  async getDebtReminderSettings(userId: string): Promise<DebtReminderSettings | null> {
    const config = await this.config.load();

    // Convert workspace config to DebtReminderSettings format for backward compatibility
    return {
      userId: SINGLE_USER_ID,
      enabled: config.debtReminder.enabled,
      frequency: config.debtReminder.frequency,
      weeklyDay: config.debtReminder.weeklyDay,
      monthlyDay: config.debtReminder.monthlyDay,
      reminderHour: config.debtReminder.reminderHour,
      lastReminderSentAt: config.debtReminder.lastSentAt
        ? new Date(config.debtReminder.lastSentAt)
        : undefined,
      updatedAt: new Date(config.updatedAt),
    };
  }

  /**
   * Create or update debt reminder settings using workspace config (backward compatibility)
   */
  async upsertDebtReminderSettings(
    settings: Omit<DebtReminderSettings, 'updatedAt'>,
  ): Promise<DebtReminderSettings> {
    const config = await this.config.load();

    // Update debt reminder settings in workspace config
    config.debtReminder.enabled = settings.enabled;
    config.debtReminder.frequency = settings.frequency;
    config.debtReminder.weeklyDay = settings.weeklyDay;
    config.debtReminder.monthlyDay = settings.monthlyDay;
    config.debtReminder.reminderHour = settings.reminderHour;
    if (settings.lastReminderSentAt) {
      config.debtReminder.lastSentAt = settings.lastReminderSentAt.toISOString();
    }

    await this.config.save(config);

    return {
      ...settings,
      updatedAt: new Date(),
    };
  }

  /**
   * Get all users who have debt reminders enabled (backward compatibility)
   * In single-user system, returns workspace user if debt reminders are enabled
   */
  async getAllDebtReminderUsers(): Promise<DebtReminderSettings[]> {
    const config = await this.config.load();

    if (!config.debtReminder.enabled) return [];

    const settings = await this.getDebtReminderSettings(SINGLE_USER_ID);
    return settings ? [settings] : [];
  }

  /**
   * Update last reminder sent timestamp using workspace config (backward compatibility)
   */
  async updateDebtReminderLastSent(userId: string): Promise<void> {
    const config = await this.config.load();
    config.debtReminder.lastSentAt = new Date().toISOString();
    await this.config.save(config);
  }

  /**
   * Calculate debt summary for workspace user using markdown storage
   */
  async getDebtSummary(userId: string): Promise<{
    totalLent: number;
    totalBorrowed: number;
    totalLentPaid: number;
    totalBorrowedPaid: number;
    pendingLentCount: number;
    pendingBorrowedCount: number;
  }> {
    const summary = await this.debts.getSummary();

    return {
      totalLent: summary.totalLent,
      totalBorrowed: summary.totalBorrowed,
      totalLentPaid: summary.totalLentPaid,
      totalBorrowedPaid: summary.totalBorrowedPaid,
      pendingLentCount: summary.pendingLentCount,
      pendingBorrowedCount: summary.pendingBorrowedCount,
    };
  }

  /**
   * Health check for markdown storage
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if workspace is accessible by loading config
      await this.config.load();
      return true;
    } catch {
      return false;
    }
  }
}
