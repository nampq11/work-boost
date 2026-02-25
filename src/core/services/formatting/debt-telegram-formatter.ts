import { InlineKeyboard } from 'grammy';
import { Debt, DebtDirection, DebtStatus } from '../../entity/debt.ts';

/**
 * Formatter for debt messages in Telegram using HTML parse mode.
 * Handles HTML escaping and message splitting for 4096 character limit.
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
    return `${symbol}${amount.toFixed(2)}`;
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
      parts.push(`<b>#${debt.id.slice(0, 8)}</b>`);
    }

    parts.push(
      `<b>${this.formatDirection(debt.direction)}</b> ${this.escapeHtml(debt.personName)}`,
    );
    parts.push(`<b>Amount:</b> ${this.formatCurrency(debt.amount, debt.currency)}`);
    parts.push(`<b>Status:</b> ${this.formatStatus(debt.status)}`);

    if (debt.reason) {
      parts.push(`<b>Reason:</b> ${this.escapeHtml(debt.reason)}`);
    }

    parts.push(`<b>Date:</b> ${this.formatDate(debt.debtDate || debt.createdAt)}`);

    if (debt.paidAt) {
      parts.push(`<b>Paid on:</b> ${this.formatDate(debt.paidAt)}`);
    }

    return parts.join('\n');
  }

  /**
   * Format a list of debts, splitting at 4096 chars if needed
   */
  formatDebtList(debts: Debt[], title?: string): string[] {
    const messages: string[] = [];
    let current = title ? `<b>${this.escapeHtml(title)}</b>\n\n` : '';

    for (const debt of debts) {
      const item = this.formatDebtItem(debt, true) + '\n\n';

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
    const netEmoji = netPosition > 0 ? '🟢' : netPosition < 0 ? '🔴' : '⚪';
    const netText =
      netPosition > 0
        ? `You're owed ${this.formatCurrency(Math.abs(netPosition), 'USD')}`
        : netPosition < 0
          ? `You owe ${this.formatCurrency(Math.abs(netPosition), 'USD')}`
          : 'All settled up!';

    return (
      `<b>💵 Debt Summary</b>\n\n` +
      `💰 <b>Owed to you:</b> ${this.formatCurrency(summary.totalLent, 'USD')}\n` +
      `   (Paid: ${this.formatCurrency(summary.totalLentPaid, 'USD')})\n` +
      `   (${summary.pendingLentCount} pending)\n\n` +
      `📥 <b>You owe:</b> ${this.formatCurrency(summary.totalBorrowed, 'USD')}\n` +
      `   (Paid: ${this.formatCurrency(summary.totalBorrowedPaid, 'USD')})\n` +
      `   (${summary.pendingBorrowedCount} pending)\n\n` +
      `${netEmoji} <b>Net:</b> ${netText}`
    );
  }

  /**
   * Create keyboard for debt menu
   */
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

  /**
   * Create keyboard for selecting debt direction
   */
  debtDirectionKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text('💰 Lent Money', 'action:debt:direction:lent')
      .row()
      .text('📥 Borrowed Money', 'action:debt:direction:borrowed')
      .row()
      .text('« Back', 'action:debt:menu');
  }

  /**
   * Create keyboard for debt list with filters
   */
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

  /**
   * Create keyboard for a single debt item
   */
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

  /**
   * Create keyboard for confirmation dialogs
   */
  confirmKeyboard(action: string, debtId: string): InlineKeyboard {
    return new InlineKeyboard()
      .text('Yes, confirm', `action:debt:confirm:${action}:${debtId}`)
      .row()
      .text('Cancel', 'action:debt:list');
  }

  /**
   * Create keyboard for reminder settings
   */
  reminderKeyboard(currentFrequency: string): InlineKeyboard {
    return new InlineKeyboard()
      .text(currentFrequency === 'weekly' ? '✓ Weekly' : 'Weekly', 'action:debt:remind:weekly')
      .text(currentFrequency === 'monthly' ? '✓ Monthly' : 'Monthly', 'action:debt:remind:monthly')
      .row()
      .text(currentFrequency === 'never' ? '✓ Never' : 'Never', 'action:debt:remind:never')
      .row()
      .text('« Back', 'action:debt:menu');
  }

  /**
   * Split message into chunks under the character limit
   */
  private splitMessage(text: string, maxLength = 4096): string[] {
    const messages: string[] = [];
    while (text.length > maxLength) {
      const splitAt = text.lastIndexOf('\n', maxLength);
      messages.push(text.slice(0, splitAt > 0 ? splitAt : maxLength));
      text = text.slice(splitAt > 0 ? splitAt : maxLength).trim();
    }
    if (text) messages.push(text);
    return messages;
  }
}
