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
 * Formatter for debt messages in Slack using plain text with emoji.
 */
export class DebtSlackFormatter {
  private formatStatus(status: DebtStatus): string {
    switch (status) {
      case DebtStatus.PENDING:
        return ':hourglass: Pending';
      case DebtStatus.PAID:
        return ':white_check_mark: Paid';
      case DebtStatus.CANCELLED:
        return ':x: Cancelled';
      default:
        return status;
    }
  }

  private escapeMrkdwn(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private formatDirection(direction: DebtDirection): string {
    return direction === DebtDirection.LENT ? ':moneybag: Lent to' : ':inbox_tray: Borrowed from';
  }

  formatDebtDocument(debt: DebtDocument, showId = false): string {
    const { frontmatter, reason } = debt;
    const parts: string[] = [];

    if (showId) {
      parts.push(`*#${frontmatter.id.slice(0, 8)}*`);
    }

    parts.push(
      `*${this.formatDirection(frontmatter.direction)}* ${this.escapeMrkdwn(
        frontmatter.personName,
      )}`,
    );
    parts.push(`*Amount:* ${formatCurrency(frontmatter.amount, frontmatter.currency)}`);
    parts.push(`*Status:* ${this.formatStatus(frontmatter.status)}`);

    if (reason) {
      parts.push(`*Reason:* ${this.escapeMrkdwn(reason)}`);
    }

    parts.push(`*Date:* ${formatDate(frontmatter.debtDate)}`);

    if (frontmatter.paidAt) {
      parts.push(`*Paid on:* ${formatDate(frontmatter.paidAt)}`);
    }

    return parts.join('\n');
  }

  formatDebtList(debts: DebtDocument[], title?: string): string[] {
    if (debts.length === 0) {
      return [title ? `${title}\n\nNo debts found.` : 'No debts found.'];
    }

    const messages: string[] = [];
    let current = title ? `${title}\n\n` : '';

    for (const debt of debts) {
      const item = this.formatDebtDocument(debt, true) + '\n\n';

      if (current.length + item.length > 15000) {
        messages.push(current.trim());
        current = item;
      } else {
        current += item;
      }
    }

    if (current.trim()) {
      messages.push(current.trim());
    }

    return messages.length > 0 ? messages : ['No debts found.'];
  }

  formatDebtSummary(summary: {
    totalLent: number;
    totalBorrowed: number;
    totalLentPaid: number;
    totalBorrowedPaid: number;
    pendingLentCount: number;
    pendingBorrowedCount: number;
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
      'slack',
    );

    return (
      `*:moneybag: Debt Summary*\n\n` +
      `:moneybag: *Owed to you:* ${formatAmounts('lent')}\n` +
      `   (Paid: ${formatAmounts('lentPaid')})\n` +
      `   (${summary.pendingLentCount} pending)\n\n` +
      `:inbox_tray: *You owe:* ${formatAmounts('borrowed')}\n` +
      `   (Paid: ${formatAmounts('borrowedPaid')})\n` +
      `   (${summary.pendingBorrowedCount} pending)\n\n` +
      `${netEmoji} *Net:* ${netSummary.text}`
    );
  }
}
