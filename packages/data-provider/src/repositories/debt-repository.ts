import { basename, join } from '@std/path';
import { DebtDirection, DebtFrontmatterSchema, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument, DebtFrontmatter, DebtSummary } from '@work-boost/data-schemas/debt.ts';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { WorkspaceFS } from '../fs/workspace-fs.ts';
import { parseMarkdown, stringifyMarkdown } from '../markdown/markdown-engine.ts';

/**
 * Debt filter options
 */
export interface DebtFilterOptions {
  status?: DebtStatus;
  direction?: DebtDirection;
  personName?: string;
  limit?: number;
}

/**
 * Debt repository interface
 */
export interface DebtRepository {
  create(data: {
    direction: DebtDirection;
    amount: number;
    currency?: string;
    personName: string;
    reason?: string;
    debtDate?: string;
    updatedBy?: DebtFrontmatter['updatedBy'];
  }): Promise<DebtDocument>;
  getById(debtId: string): Promise<DebtDocument | null>;
  listAll(includeArchived?: boolean): Promise<DebtDocument[]>;
  filter(options: DebtFilterOptions): Promise<DebtDocument[]>;
  settle(debtId: string): Promise<DebtDocument | null>;
  cancel(debtId: string): Promise<DebtDocument | null>;
  update(
    debtId: string,
    updates: {
      direction?: DebtDirection;
      amount?: number;
      currency?: string;
      personName?: string;
      reason?: string;
      status?: DebtStatus;
      debtDate?: string;
      updatedBy?: DebtFrontmatter['updatedBy'];
      paidAt?: string | null;
    },
  ): Promise<DebtDocument | null>;
  delete(debtId: string): Promise<boolean>;
  getSummary(): Promise<DebtSummary>;
}

/**
 * Create a new debt repository instance
 * @param fs Workspace file system instance
 */
export function createDebtRepository(fs: WorkspaceFS): DebtRepository {
  const debtLocks = new Map<string, Promise<void>>();

  async function withDebtLock<T>(debtId: string, task: () => Promise<T>): Promise<T> {
    while (debtLocks.has(debtId)) {
      await debtLocks.get(debtId);
    }

    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    debtLocks.set(debtId, lock);

    try {
      return await task();
    } finally {
      debtLocks.delete(debtId);
      release();
    }
  }

  const generateSlug = (personName: string, id: string): string => {
    const cleanName = personName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'debt';
    const shortId = id.slice(0, 4);
    return `${cleanName}-${shortId}.md`;
  };

  return {
    async create(data: {
      direction: DebtDirection;
      amount: number;
      currency?: string;
      personName: string;
      reason?: string;
      debtDate?: string;
      updatedBy?: DebtFrontmatter['updatedBy'];
    }): Promise<DebtDocument> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const frontmatter = DebtFrontmatterSchema.parse({
        id,
        direction: data.direction,
        amount: data.amount,
        currency: data.currency || 'USD',
        personName: data.personName,
        status: DebtStatus.PENDING,
        debtDate: data.debtDate || now.slice(0, 10),
        createdAt: now,
        updatedAt: now,
        paidAt: null,
        updatedBy: data.updatedBy,
      });

      const fileName = generateSlug(data.personName, id);
      const filePath = join('debts', fileName);
      const rawMarkdown = stringifyMarkdown(frontmatter, data.reason || '');

      await fs.writeTextAtomic(filePath, rawMarkdown);

      return { frontmatter, reason: data.reason || '', filePath };
    },

    async getById(debtId: string): Promise<DebtDocument | null> {
      const allDebts = await this.listAll(true);
      return allDebts.find((d) => d.frontmatter.id === debtId) || null;
    },

    async listAll(includeArchived = false): Promise<DebtDocument[]> {
      const activePaths = await fs.listFiles('debts');
      const archivePaths = includeArchived ? await fs.listFiles('debts/archive') : [];
      const allPaths = [...activePaths, ...archivePaths];
      const mdPaths = allPaths.filter((p) => p.endsWith('.md'));

      const results: DebtDocument[] = [];
      for (const p of mdPaths) {
        try {
          const raw = await fs.readText(p);
          const { frontmatter, body } = parseMarkdown<unknown>(raw);
          results.push({
            frontmatter: DebtFrontmatterSchema.parse(frontmatter),
            reason: body,
            filePath: p,
          });
        } catch (error) {
          logger.warn('Corrupted debt file detected', { path: p });
          logger.debug('Corrupted debt file parse error', {
            path: p,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return results.sort((a, b) => b.frontmatter.createdAt.localeCompare(a.frontmatter.createdAt));
    },

    async filter(options: DebtFilterOptions): Promise<DebtDocument[]> {
      // Paid and cancelled debts live in debts/archive/, so terminal-status filters must include it
      const archivedStatuses = [DebtStatus.PAID, DebtStatus.CANCELLED];
      const all = await this.listAll(
        options.status !== undefined && archivedStatuses.includes(options.status),
      );
      const filtered = all.filter((doc) => {
        const fm = doc.frontmatter;
        if (options.status && fm.status !== options.status) return false;
        if (options.direction && fm.direction !== options.direction) return false;
        if (
          options.personName &&
          !fm.personName.toLowerCase().includes(options.personName.toLowerCase())
        ) {
          return false;
        }
        return true;
      });
      return options.limit === undefined ? filtered : filtered.slice(0, options.limit);
    },

    async settle(debtId: string): Promise<DebtDocument | null> {
      return withDebtLock(debtId, async () => {
        const debt = await this.getById(debtId);
        if (!debt || debt.frontmatter.status !== DebtStatus.PENDING) return null;

        const now = new Date().toISOString();
        debt.frontmatter.status = DebtStatus.PAID;
        debt.frontmatter.paidAt = now;
        debt.frontmatter.updatedAt = now;

        const updatedRaw = stringifyMarkdown(debt.frontmatter, debt.reason);
        await fs.writeTextAtomic(debt.filePath, updatedRaw);

        const fileName = basename(debt.filePath);
        const archivePath = join('debts', 'archive', fileName);
        await fs.move(debt.filePath, archivePath);
        debt.filePath = archivePath;

        return debt;
      });
    },

    async cancel(debtId: string): Promise<DebtDocument | null> {
      return withDebtLock(debtId, async () => {
        const debt = await this.getById(debtId);
        if (!debt || debt.frontmatter.status !== DebtStatus.PENDING) return null;

        debt.frontmatter.status = DebtStatus.CANCELLED;
        debt.frontmatter.updatedAt = new Date().toISOString();

        const updatedRaw = stringifyMarkdown(debt.frontmatter, debt.reason);
        await fs.writeTextAtomic(debt.filePath, updatedRaw);

        const archivePath = join('debts', 'archive', basename(debt.filePath));
        await fs.move(debt.filePath, archivePath);
        debt.filePath = archivePath;

        return debt;
      });
    },

    async update(debtId, updates) {
      return withDebtLock(debtId, async () => {
        const debt = await this.getById(debtId);
        if (!debt) return null;
        if (updates.status !== undefined && updates.status !== debt.frontmatter.status) {
          throw new Error('Debt status changes must use settle() to preserve file location');
        }

        const { reason, ...frontmatterUpdates } = updates;
        for (const [key, value] of Object.entries(frontmatterUpdates)) {
          if (value !== undefined) Object.assign(debt.frontmatter, { [key]: value });
        }
        if (reason !== undefined) debt.reason = reason;
        debt.frontmatter.updatedAt = new Date().toISOString();
        debt.frontmatter = DebtFrontmatterSchema.parse(debt.frontmatter);
        await fs.writeTextAtomic(debt.filePath, stringifyMarkdown(debt.frontmatter, debt.reason));
        return debt;
      });
    },

    async delete(debtId) {
      return withDebtLock(debtId, async () => {
        const debt = await this.getById(debtId);
        if (!debt) return false;
        await fs.remove(debt.filePath);
        return true;
      });
    },

    async getSummary(): Promise<DebtSummary> {
      const allDebts = await this.listAll(true);
      const summary: DebtSummary = {
        totalLent: 0,
        totalBorrowed: 0,
        totalLentPaid: 0,
        totalBorrowedPaid: 0,
        pendingLentCount: 0,
        pendingBorrowedCount: 0,
        netPosition: 0,
        currencies: {},
      };

      for (const d of allDebts) {
        const { amount, currency, direction } = d.frontmatter;
        if (!summary.currencies[currency]) {
          summary.currencies[currency] = {
            lent: 0,
            borrowed: 0,
            lentPaid: 0,
            borrowedPaid: 0,
          };
        }

        if (direction === DebtDirection.LENT) {
          if (d.frontmatter.status === DebtStatus.PENDING) {
            summary.totalLent += amount;
            summary.pendingLentCount++;
            summary.currencies[currency].lent += amount;
          } else if (d.frontmatter.status === DebtStatus.PAID) {
            summary.totalLentPaid += amount;
            summary.currencies[currency].lentPaid += amount;
          }
        } else if (d.frontmatter.status === DebtStatus.PENDING) {
          summary.totalBorrowed += amount;
          summary.pendingBorrowedCount++;
          summary.currencies[currency].borrowed += amount;
        } else if (d.frontmatter.status === DebtStatus.PAID) {
          summary.totalBorrowedPaid += amount;
          summary.currencies[currency].borrowedPaid += amount;
        }
      }

      if (Object.keys(summary.currencies).length > 1) {
        summary.totalLent = 0;
        summary.totalBorrowed = 0;
        summary.totalLentPaid = 0;
        summary.totalBorrowedPaid = 0;
        summary.netPosition = 0;
      } else {
        summary.netPosition = summary.totalLent - summary.totalBorrowed;
      }
      return summary;
    },
  };
}
