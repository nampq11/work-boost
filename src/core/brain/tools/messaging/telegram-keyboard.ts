/**
 * Telegram Keyboard Tool
 *
 * Sends a Telegram message with inline keyboard
 */

import { logger } from '../../../logger/logger.ts';
import type { LangfuseService } from '../../../observability/langfuse/langfuse.ts';
import type { MessageButton, MessageSender } from '../../../ports/messaging.ts';
import type { Tool } from '../../types.ts';
import { validateToolParams } from '../../validation.ts';
import { SCHEMAS } from '../../validation.ts';

/**
 * Create a send_telegram_keyboard tool
 * Sends a Telegram message with inline keyboard
 */
export function createSendTelegramKeyboardTool(
  telegram: MessageSender | null,
  langfuse?: LangfuseService | null,
): Tool {
  return {
    name: 'send_telegram_keyboard',
    description:
      'Send a Telegram message with an inline keyboard (buttons). Use this for interactive Telegram messages.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'The chat ID to send the message to',
        },
        text: {
          type: 'string',
          description: 'The message text to send',
        },
        keyboard: {
          type: 'array',
          description:
            '2D array of keyboard buttons. Each button has text and optional callback_data or url.',
          items: {
            type: 'array',
            items: {
              type: 'object',
            },
          },
        },
        parseMode: {
          type: 'string',
          enum: ['HTML', 'Markdown', 'None'],
          description: 'The parse mode for formatting (default: HTML)',
        },
      },
      required: ['chatId', 'text', 'keyboard'],
    },
    execute: async (params: unknown) => {
      // Validate parameters
      const validation = validateToolParams(params, SCHEMAS.sendTelegramKeyboard);
      if (!validation.valid) {
        logger.warn('Invalid send_telegram_keyboard parameters', { error: validation.error });
        return {
          success: false,
          error: validation.error || 'Validation failed',
        };
      }

      const {
        chatId,
        text,
        keyboard,
        parseMode = 'HTML',
      } = validation.data! as {
        chatId: string;
        text: string;
        keyboard: MessageButton[][];
        parseMode?: 'HTML' | 'Markdown' | 'None';
      };

      try {
        if (!telegram) {
          return {
            success: false,
            error: 'Telegram service not available',
          };
        }

        await telegram.sendMessage(chatId, text, { parseMode, keyboard });

        return {
          success: true,
          data: { message: 'Sent successfully' },
        };
      } catch (error) {
        logger.error('Failed to send Telegram message', { chatId, error });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}
