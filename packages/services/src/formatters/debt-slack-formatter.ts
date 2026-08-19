import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';

/**
 * Formatter for debt messages in Slack using plain text with emoji.
 */
export class DebtSlackFormatter {
  formatCurrency(amount: number, currency: string): string {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      JPY: '¥',
      VND: '₫',
    };
    const symbol = symbols[currency] || currency + ' ';
    return `${symbol}${amount.toLocaleString('vi-VN')}`;
  }

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

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatDebtDocument(debt: DebtDocument, showId = false): string {
    const { frontmatter, reason } = debt;
    const parts: string[] = [];

    if (showId) {
      parts.push(`*#${frontmatter.id.slice(0, 8)}*`);
    }

    parts.push(
      `*${this.formatDirection(frontmatter.direction)}* ${this.escapeMrkdwn(frontmatter.personName)}`,
    );
    parts.push(`*Amount:* ${this.formatCurrency(frontmatter.amount, frontmatter.currency)}`);
    parts.push(`*Status:* ${this.formatStatus(frontmatter.status)}`);

    if (reason) {
      parts.push(`*Reason:* ${this.escapeMrkdwn(reason)}`);
    }

    parts.push(`*Date:* ${this.formatDate(frontmatter.debtDate)}`);

    if (frontmatter.paidAt) {
      parts.push(`*Paid on:* ${this.formatDate(frontmatter.paidAt)}`);
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
    const currencies = summary.currencies || {
      USD: {
        lent: summary.totalLent,
        borrowed: summary.totalBorrowed,
        lentPaid: summary.totalLentPaid,
        borrowedPaid: summary.totalBorrowedPaid,
      },
    };
    const formatAmounts = (key: 'lent' | 'borrowed' | 'lentPaid' | 'borrowedPaid') =>
      Object.entries(currencies)
        .filter(([, totals]) => totals[key] > 0)
        .map(([currency, totals]) => this.formatCurrency(totals[key], currency))
        .join(', ') || this.formatCurrency(0, 'USD');
    const netPositions = Object.entries(currencies).map(([currency, totals]) => ({
      currency,
      value: totals.lent - totals.borrowed,
    }));
    const netText =
      netPositions
        .map(({ currency, value: netPosition }) => {
          if (netPosition > 0) return `You're owed ${this.formatCurrency(netPosition, currency)}`;
          if (netPosition < 0) {
            return `You owe ${this.formatCurrency(Math.abs(netPosition), currency)}`;
          }
          return null;
        })
        .filter((text): text is string => text !== null)
        .join(', ') || 'All settled up!';
    const hasPositivePosition = netPositions.some(({ value }) => value > 0);
    const hasNegativePosition = netPositions.some(({ value }) => value < 0);
    const netEmoji =
      hasPositivePosition && !hasNegativePosition
        ? ':large_green_circle:'
        : hasNegativePosition && !hasPositivePosition
          ? ':red_circle:'
          : ':white_circle:';

    return (
      `*:moneybag: Debt Summary*\n\n` +
      `:moneybag: *Owed to you:* ${formatAmounts('lent')}\n` +
      `   (Paid: ${formatAmounts('lentPaid')})\n` +
      `   (${summary.pendingLentCount} pending)\n\n` +
      `:inbox_tray: *You owe:* ${formatAmounts('borrowed')}\n` +
      `   (Paid: ${formatAmounts('borrowedPaid')})\n` +
      `   (${summary.pendingBorrowedCount} pending)\n\n` +
      `${netEmoji} *Net:* ${netText}`
    );
  }
}
