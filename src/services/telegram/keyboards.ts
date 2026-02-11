import { InlineKeyboard } from 'grammy';

/**
 * Main menu keyboard shown after /start
 */
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Subscribe', 'action:subscribe')
    .text('Status', 'action:status')
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
