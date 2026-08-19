import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import { InlineKeyboard } from 'grammy';

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
   * Format currency with symbol
   */
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
   * Format date in readable format
   */
  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
      `<b>${this.formatDirection(frontmatter.direction)}</b> ${this.escapeHtml(frontmatter.personName)}`,
    );
    parts.push(`<b>Amount:</b> ${this.formatCurrency(frontmatter.amount, frontmatter.currency)}`);
    parts.push(`<b>Status:</b> ${this.formatStatus(frontmatter.status)}`);

    if (reason) {
      parts.push(`<b>Reason:</b> ${this.escapeHtml(reason)}`);
    }

    parts.push(`<b>Date:</b> ${this.formatDate(frontmatter.debtDate)}`);

    if (frontmatter.paidAt) {
      parts.push(`<b>Paid on:</b> ${this.formatDate(frontmatter.paidAt)}`);
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
        ? '🟢'
        : hasNegativePosition && !hasPositivePosition
          ? '🔴'
          : '⚪';

    return (
      `<b>💵 Debt Summary</b>\n\n` +
      `💰 <b>Owed to you:</b> ${formatAmounts('lent')}\n` +
      `   (Paid: ${formatAmounts('lentPaid')})\n` +
      `   (${summary.pendingLentCount} pending)\n\n` +
      `📥 <b>You owe:</b> ${formatAmounts('borrowed')}\n` +
      `   (Paid: ${formatAmounts('borrowedPaid')})\n` +
      `   (${summary.pendingBorrowedCount} pending)\n\n` +
      `${netEmoji} <b>Net:</b> ${netText}`
    );
  }

  debtMenuKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text('📝 Record Debt', 'action:debt:record')
      .text('📋 My Debts', 'action:debt:list')
      .row()
      .text('📊 Summary', 'action:debt:summary')
      .text('⏰ Reminders', 'action:debt:remind')
      .row()
      .text('« Back', 'action:cancel');
  }

  debtDirectionKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text('💰 Lent Money', 'action:debt:direction:lent')
      .row()
      .text('📥 Borrowed Money', 'action:debt:direction:borrowed')
      .row()
      .text('« Back', 'action:debt:menu');
  }

  debtListKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text('All', 'action:debt:filter:all')
      .text('Pending', 'action:debt:filter:pending')
      .text('Paid', 'action:debt:filter:paid')
      .row()
      .text('Lent', 'action:debt:filter:lent')
      .text('Borrowed', 'action:debt:filter:borrowed')
      .row()
      .text('« Back', 'action:debt:menu');
  }

  debtItemKeyboard(debtId: string, status: DebtStatus): InlineKeyboard {
    const keyboard = new InlineKeyboard();

    if (status === DebtStatus.PENDING) {
      keyboard
        .text('✅ Mark Paid', `action:debt:settle:${debtId}`)
        .text('✏️ Edit', `action:debt:edit:${debtId}`)
        .row();
    }

    keyboard
      .text('🗑 Delete', `action:debt:delete:${debtId}`)
      .row()
      .text('« Back', 'action:debt:list');

    return keyboard;
  }

  confirmKeyboard(action: string, debtId: string): InlineKeyboard {
    return new InlineKeyboard()
      .text('Yes, confirm', `action:debt:confirm:${action}:${debtId}`)
      .row()
      .text('Cancel', 'action:debt:list');
  }

  remindKeyboard(currentFrequency: string): InlineKeyboard {
    return new InlineKeyboard()
      .text(currentFrequency === 'weekly' ? '✓ Weekly' : 'Weekly', 'action:debt:remind:weekly')
      .text(currentFrequency === 'monthly' ? '✓ Monthly' : 'Monthly', 'action:debt:remind:monthly')
      .row()
      .text(currentFrequency === 'never' ? '✓ Never' : 'Never', 'action:debt:remind:never')
      .row()
      .text('« Back', 'action:debt:menu');
  }
}
