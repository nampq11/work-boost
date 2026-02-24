import { InlineKeyboard } from 'grammy';
import { DebtStatus } from '../../entity/debt.ts';

/**
 * Main menu keyboard shown after /start
 */
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Subscribe', 'action:subscribe')
    .text('Status', 'action:status')
    .row()
    .text('💵 Debts', 'action:debt:menu')
    .row()
    .text('Help', 'action:help')
    .text('Unsubscribe', 'action:unsubscribe');
}

/**
 * Confirmation keyboard for unsubscribe action
 */
export function unsubscribeConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Yes, unsubscribe', 'action:unsubscribe_confirm')
    .row()
    .text('Cancel', 'action:cancel');
}

/**
 * Language selection keyboard
 */
export function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Tiếng Việt', 'action:lang_vi')
    .text('English', 'action:lang_en');
}

// ============================================================================
// Debt Tracking Keyboards
// ============================================================================

/**
 * Debt menu keyboard - main entry point for debt features
 */
export function debtMenuKeyboard(): InlineKeyboard {
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
 * Debt direction selection keyboard
 */
export function debtDirectionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💰 Lent Money', 'action:debt:direction:lent')
    .row()
    .text('📥 Borrowed Money', 'action:debt:direction:borrowed')
    .row()
    .text('« Back', 'action:debt:menu');
}

/**
 * Debt list filter keyboard
 */
export function debtListKeyboard(): InlineKeyboard {
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
 * Keyboard for a single debt item action buttons
 */
export function debtItemKeyboard(debtId: string, status: DebtStatus): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (status === DebtStatus.PENDING) {
    keyboard.text('✅ Mark Paid', `action:debt:settle:${debtId}`).row();
  }

  keyboard
    .text('🗑 Delete', `action:debt:delete:${debtId}`)
    .row()
    .text('« Back', 'action:debt:list');

  return keyboard;
}

/**
 * Confirmation keyboard for debt actions
 */
export function debtConfirmKeyboard(action: string, debtId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Yes, confirm', `action:debt:confirm:${action}:${debtId}`)
    .row()
    .text('Cancel', 'action:debt:list');
}

/**
 * Reminder settings keyboard
 */
export function debtReminderKeyboard(currentFrequency: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(currentFrequency === 'weekly' ? '✓ Weekly' : 'Weekly', 'action:debt:remind:weekly')
    .text(currentFrequency === 'monthly' ? '✓ Monthly' : 'Monthly', 'action:debt:remind:monthly')
    .row()
    .text(currentFrequency === 'never' ? '✓ Never' : 'Never', 'action:debt:remind:never')
    .row()
    .text('« Back', 'action:debt:menu');
}
