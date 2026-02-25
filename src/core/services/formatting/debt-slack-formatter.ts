import { Debt, DebtDirection, DebtStatus } from '../../entity/debt.ts';

/**
 * Formatter for debt messages in Slack using plain text with emoji.
 */
export class DebtSlackFormatter {
  /**
   * Format currency with symbol
   */
  private formatCurrency(amount: number, currency: string): string {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      JPY: '¥',
      VND: '₫',
    };
    const symbol = symbols[currency] || currency + ' ';
    return `${symbol}${amount.toFixed(2)}`;
  }

  /**
   * Format status with emoji
   */
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

  /**
   * Format direction with emoji
   */
  private formatDirection(direction: DebtDirection): string {
    return direction === DebtDirection.LENT ? ':moneybag: Lent to' : ':inbox_tray: Borrowed from';
  }

  /**
   * Format date in readable format
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  /**
   * Format a single debt item
   */
  formatDebtItem(debt: Debt, showId = false): string {
    const parts: string[] = [];

    if (showId) {
      parts.push(`*#${debt.id.slice(0, 8)}*`);
    }

    parts.push(`*${this.formatDirection(debt.direction)}* ${debt.personName}`);
    parts.push(`*Amount:* ${this.formatCurrency(debt.amount, debt.currency)}`);
    parts.push(`*Status:* ${this.formatStatus(debt.status)}`);

    if (debt.reason) {
      parts.push(`*Reason:* ${debt.reason}`);
    }

    parts.push(`*Date:* ${this.formatDate(debt.debtDate || debt.createdAt)}`);

    if (debt.paidAt) {
      parts.push(`*Paid on:* ${this.formatDate(debt.paidAt)}`);
    }

    return parts.join('\n');
  }

  /**
   * Format a list of debts
   */
  formatDebtList(debts: Debt[], title?: string): string[] {
    if (debts.length === 0) {
      return [title ? `${title}\n\nNo debts found.` : 'No debts found.'];
    }

    const messages: string[] = [];
    let current = title ? `${title}\n\n` : '';

    for (const debt of debts) {
      const item = this.formatDebtItem(debt, true) + '\n\n';

      // Slack has a higher limit, but we'll still be reasonable
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

  /**
   * Format a summary of debts
   */
  formatDebtSummary(summary: {
    totalLent: number;
    totalBorrowed: number;
    totalLentPaid: number;
    totalBorrowedPaid: number;
    pendingLentCount: number;
    pendingBorrowedCount: number;
  }): string {
    const netPosition = summary.totalLent - summary.totalBorrowed;
    const netEmoji =
      netPosition > 0
        ? ':large_green_circle:'
        : netPosition < 0
          ? ':red_circle:'
          : ':white_circle:';
    const netText =
      netPosition > 0
        ? `You're owed ${this.formatCurrency(Math.abs(netPosition), 'USD')}`
        : netPosition < 0
          ? `You owe ${this.formatCurrency(Math.abs(netPosition), 'USD')}`
          : 'All settled up!';

    return (
      `*:moneybag: Debt Summary*\n\n` +
      `:moneybag: *Owed to you:* ${this.formatCurrency(summary.totalLent, 'USD')}\n` +
      `   (Paid: ${this.formatCurrency(summary.totalLentPaid, 'USD')})\n` +
      `   (${summary.pendingLentCount} pending)\n\n` +
      `:inbox_tray: *You owe:* ${this.formatCurrency(summary.totalBorrowed, 'USD')}\n` +
      `   (Paid: ${this.formatCurrency(summary.totalBorrowedPaid, 'USD')})\n` +
      `   (${summary.pendingBorrowedCount} pending)\n\n` +
      `${netEmoji} *Net:* ${netText}`
    );
  }
}
