/**
 * Send Message Tool
 *
 * Sends a text message to either Slack or Telegram
 */

import { logger } from '@work-boost/shared/logger/logger.ts';
import type { LangfuseService } from '@work-boost/shared/observability/langfuse/langfuse.ts';
import type { MessageSender } from '../../ports/messaging.ts';
import type { SendMessageParams, Tool } from '../../types.ts';
import { validateToolParams } from '../../validation.ts';
import { SCHEMAS } from '../../validation.ts';

/**
 * Create a send_message tool
 * Sends a text message to either Slack or Telegram
 */
export function createSendMessageTool(
  slack: MessageSender | null,
  telegram: MessageSender | null,
  langfuse?: LangfuseService | null,
): Tool {
  return {
    name: 'send_message',
    description:
      'Send a message to a user on Slack or Telegram. Use this when you need to respond to a user or send a notification.',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['slack', 'telegram'],
          description: 'The platform to send the message to',
        },
        chatId: {
          type: 'string',
          description: 'The chat ID to send the message to',
        },
        text: {
          type: 'string',
          description: 'The message text to send',
        },
        parseMode: {
          type: 'string',
          enum: ['HTML', 'Markdown', 'None'],
          description: 'The parse mode for formatting (Telegram only)',
        },
      },
      required: ['platform', 'chatId', 'text'],
    },
    execute: async (params: unknown) => {
      // Validate parameters
      const validation = validateToolParams(params, SCHEMAS.sendMessage);
      if (!validation.valid) {
        logger.warn('Invalid send_message parameters', { error: validation.error });
        return {
          success: false,
          error: validation.error || 'Validation failed',
        };
      }

      const { platform, chatId, text, parseMode } =
        validation.data! as unknown as SendMessageParams;

      const startTime = Date.now();

      // Create span for tool execution if Langfuse is enabled
      let span: ReturnType<ReturnType<LangfuseService['createTrace']>['span']> | null = null;
      let trace: ReturnType<LangfuseService['createTrace']> | null = null;
      if (langfuse?.isEnabled()) {
        trace = langfuse.createTrace({
          name: 'tool_send_message',
          input: { platform, chatId, text: text.substring(0, 100) + '...' },
          metadata: { tool: 'send_message', platform },
        });
        span = trace.span({
          name: 'tool_execution',
          input: { platform, chatId, textLength: text.length },
        });
      }

      try {
        const service = platform === 'slack' ? slack : telegram;

        if (!service) {
          if (span) {
            span.update({ output: { success: false, error: `${platform} service not available` } });
            span.end();
          }
          if (trace) {
            trace.end();
          }
          return {
            success: false,
            error: `${platform} service not available`,
          };
        }

        await service.sendMessage(chatId, text, { parseMode });

        if (span) {
          span.update({
            output: { success: true },
            metadata: { duration: Date.now() - startTime },
          });
          span.end();
        }
        if (trace) {
          trace.end();
        }

        return {
          success: true,
          data: { message: 'Sent successfully' },
        };
      } catch (error) {
        logger.error('Failed to send message', { platform, chatId, error });

        if (span) {
          span.update({
            output: {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            metadata: { duration: Date.now() - startTime },
          });
          span.end();
        }
        if (trace) {
          trace.end();
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}
