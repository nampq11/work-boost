import { InlineKeyboard } from 'grammy';

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
    .text('« Back', 'action:cancel');
}
