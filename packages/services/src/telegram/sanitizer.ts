/**
 * Input sanitization utilities for Telegram bot
 */

const MAX_TEXT_LENGTH = 10000; // Maximum user input length
const MAX_CALLBACK_DATA_LENGTH = 64; // Telegram's limit for callback data

/**
 * Sanitize user input by removing control characters and trimming
 */
export function sanitizeUserInput(input: string): string {
  // Remove control characters except newlines, tabs, and carriage returns
  return input
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

/**
 * Validate text input length
 */
export function isValidTextLength(text: string): boolean {
  return text.length > 0 && text.length <= MAX_TEXT_LENGTH;
}

/**
 * Validate callback data length
 */
export function isValidCallbackDataLength(data: string): boolean {
  return data.length > 0 && data.length <= MAX_CALLBACK_DATA_LENGTH;
}

/**
 * Sanitize callback data
 */
export function sanitizeCallbackData(data: string): string {
  return data
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove all control characters
    .trim()
    .slice(0, MAX_CALLBACK_DATA_LENGTH);
}

/**
 * Validate Telegram user ID format (should be numeric)
 */
export function isValidTelegramUserId(userId: string): boolean {
  return /^\d+$/.test(userId);
}

/**
 * Validate Telegram chat ID format (should be numeric, may be negative for groups)
 */
export function isValidTelegramChatId(chatId: string): boolean {
  return /^-?\d+$/.test(chatId);
}

/**
 * Sanitization middleware for grammY
 * Sanitizes message text and callback data before handlers process them
 */
export function createSanitizationMiddleware() {
  return async (ctx: any, next: () => Promise<void>) => {
    // Sanitize message text
    if (ctx.message?.text) {
      ctx.message.text = sanitizeUserInput(ctx.message.text);
    }

    // Sanitize callback query data
    if (ctx.callbackQuery?.data) {
      ctx.callbackQuery.data = sanitizeCallbackData(ctx.callbackQuery.data);
    }

    await next();
  };
}
