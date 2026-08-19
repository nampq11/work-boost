import { basename, join } from '@std/path';
import { DebtDirection, DebtFrontmatterSchema, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument, DebtFrontmatter, DebtSummary } from '@work-boost/data-schemas/debt.ts';
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
  }): Promise<DebtDocument>;
  getById(debtId: string): Promise<DebtDocument | null>;
  listAll(includeArchived?: boolean): Promise<DebtDocument[]>;
  filter(options: DebtFilterOptions): Promise<DebtDocument[]>;
  settle(debtId: string): Promise<DebtDocument | null>;
  update(debtId: string, updates: {
    direction?: DebtDirection;
    amount?: number;
    currency?: string;
    personName?: string;
    reason?: string;
    status?: DebtStatus;
    debtDate?: string;
    paidAt?: string | null;
  }): Promise<DebtDocument | null>;
  delete(debtId: string): Promise<boolean>;
  getSummary(): Promise<DebtSummary>;
}

/**
 * Create a new debt repository instance
 * @param fs Workspace file system instance
 */
export function createDebtRepository(fs: WorkspaceFS): DebtRepository {
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

      const results: DebtDocument[] = [];
      for (const p of allPaths) {
        try {
          const raw = await fs.readText(p);
          const { frontmatter, body } = parseMarkdown<unknown>(raw);
          results.push({
            frontmatter: DebtFrontmatterSchema.parse(frontmatter),
            reason: body,
            filePath: p,
          });
        } catch (error) {
          throw new Error(`Failed to read debt file ${p}`, { cause: error });
        }
      }
      return results.sort((a, b) => b.frontmatter.createdAt.localeCompare(a.frontmatter.createdAt));
    },

    async filter(options: DebtFilterOptions): Promise<DebtDocument[]> {
      const all = await this.listAll(options.status === DebtStatus.PAID);
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
      const debt = await this.getById(debtId);
      if (!debt || debt.frontmatter.status === DebtStatus.PAID) return null;

      const now = new Date().toISOString();
      debt.frontmatter.status = DebtStatus.PAID;
      debt.frontmatter.paidAt = now;
      debt.frontmatter.updatedAt = now;

      const updatedRaw = stringifyMarkdown(debt.frontmatter, debt.reason);

      // Write updated content
      await fs.writeTextAtomic(debt.filePath, updatedRaw);

      // Move to archive
      const fileName = basename(debt.filePath);
      const archivePath = join('debts', 'archive', fileName);
      await fs.move(debt.filePath, archivePath);
      debt.filePath = archivePath;

      return debt;
    },

    async update(debtId, updates) {
      const debt = await this.getById(debtId);
      if (!debt) return null;

      const { reason, ...frontmatterUpdates } = updates;
      for (const [key, value] of Object.entries(frontmatterUpdates)) {
        if (value !== undefined) Object.assign(debt.frontmatter, { [key]: value });
      }
      if (reason !== undefined) debt.reason = reason;
      debt.frontmatter.updatedAt = new Date().toISOString();
      debt.frontmatter = DebtFrontmatterSchema.parse(debt.frontmatter);
      await fs.writeTextAtomic(debt.filePath, stringifyMarkdown(debt.frontmatter, debt.reason));
      return debt;
    },

    async delete(debtId) {
      const debt = await this.getById(debtId);
      if (!debt) return false;
      await fs.remove(debt.filePath);
      return true;
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

      summary.netPosition = summary.totalLent - summary.totalBorrowed;
      return summary;
    },
  };
}
