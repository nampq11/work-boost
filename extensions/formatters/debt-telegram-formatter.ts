import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import {
  calculateNetSummary,
  formatCurrency,
  formatDate,
  resolveDebtCurrencies,
  resolveNetEmoji,
} from './debt-formatting.ts';

/**
 * Formatter for debt messages in Telegram using HTML parse mode.
 * Works with DebtDocument (markdown-storage model) throughout.
 */
export class DebtTelegramFormatter {
  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Format status with emoji
   */
  private formatStatus(status: DebtStatus): string {
    switch (status) {
      case DebtStatus.PENDING:
        return '⏳ Pending';
      case DebtStatus.PAID:
        return '✅ Paid';
      case DebtStatus.CANCELLED:
        return '❌ Cancelled';
      default:
        return status;
    }
  }

  /**
   * Format direction with emoji
   */
  private formatDirection(direction: DebtDirection): string {
    return direction === DebtDirection.LENT ? '💰 Lent to' : '📥 Borrowed from';
  }

  /**
   * Format a single debt document
   */
  formatDebtDocument(debt: DebtDocument, showId = false): string {
    const { frontmatter, reason } = debt;
    const parts: string[] = [];

    if (showId) {
      parts.push(`<b>#${frontmatter.id.slice(0, 8)}</b>`);
    }

    parts.push(
      `<b>${this.formatDirection(frontmatter.direction)}</b> ${this.escapeHtml(
        frontmatter.personName,
      )}`,
    );
    parts.push(`<b>Amount:</b> ${formatCurrency(frontmatter.amount, frontmatter.currency)}`);
    parts.push(`<b>Status:</b> ${this.formatStatus(frontmatter.status)}`);

    if (reason) {
      parts.push(`<b>Reason:</b> ${this.escapeHtml(reason)}`);
    }

    parts.push(`<b>Date:</b> ${formatDate(frontmatter.debtDate)}`);

    if (frontmatter.paidAt) {
      parts.push(`<b>Paid on:</b> ${formatDate(frontmatter.paidAt)}`);
    }

    return parts.join('\n');
  }

  /**
   * Format a list of debt documents, splitting at 4096 chars if needed
   */
  formatDebtList(debts: DebtDocument[], title?: string): string[] {
    const messages: string[] = [];
    let current = title ? `<b>${this.escapeHtml(title)}</b>\n\n` : '';

    for (const debt of debts) {
      const item = this.formatDebtDocument(debt, true) + '\n\n';

      if (current.length + item.length > 4096) {
        messages.push(current.trim());
        current = item;
      } else {
        current += item;
      }
    }

    if (current.trim()) {
      messages.push(current.trim());
    }

    if (messages.length === 0 && title) {
      return [`<b>${this.escapeHtml(title)}</b>\n\nNo debts found.`];
    }

    return messages;
  }

  /**
   * Format a debt summary
   */
  formatDebtSummary(summary: {
    totalLent: number;
    totalBorrowed: number;
    totalLentPaid: number;
    totalBorrowedPaid: number;
    pendingLentCount: number;
    pendingBorrowedCount: number;
    netPosition: number;
    currencies?: Record<
      string,
      {
        lent: number;
        borrowed: number;
        lentPaid: number;
        borrowedPaid: number;
      }
    >;
  }): string {
    const currencies = resolveDebtCurrencies(summary);
    function formatAmounts(key: 'lent' | 'borrowed' | 'lentPaid' | 'borrowedPaid'): string {
      const amounts = Object.entries(currencies)
        .filter(([, totals]) => totals[key] > 0)
        .map(([currency, totals]) => formatCurrency(totals[key], currency));
      return amounts.join(', ') || formatCurrency(0, 'USD');
    }
    const netSummary = calculateNetSummary(currencies);
    const netEmoji = resolveNetEmoji(
      netSummary.hasPositivePosition,
      netSummary.hasNegativePosition,
      'telegram',
    );

    return (
      `<b>💵 Debt Summary</b>\n\n` +
      `💰 <b>Owed to you:</b> ${formatAmounts('lent')}\n` +
      `   (Paid: ${formatAmounts('lentPaid')})\n` +
      `   (${summary.pendingLentCount} pending)\n\n` +
      `📥 <b>You owe:</b> ${formatAmounts('borrowed')}\n` +
      `   (Paid: ${formatAmounts('borrowedPaid')})\n` +
      `   (${summary.pendingBorrowedCount} pending)\n\n` +
      `${netEmoji} <b>Net:</b> ${netSummary.text}`
    );
  }
}
