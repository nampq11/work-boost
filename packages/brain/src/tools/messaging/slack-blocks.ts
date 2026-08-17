/**
 * Slack Blocks Tool
 *
 * Sends a formatted Slack message with blocks
 */

import { logger } from '@work-boost/shared/logger/logger.ts';
import type { LangfuseService } from '@work-boost/shared/observability/langfuse/langfuse.ts';
import type { MessageButton, MessageSender } from '../../ports/messaging.ts';
import type { Tool } from '../../types.ts';
import { validateToolParams } from '../../validation.ts';
import { SCHEMAS } from '../../validation.ts';

/**
 * Create a send_slack_blocks tool
 * Sends a formatted Slack message with blocks
 */
export function createSendSlackBlocksTool(
  slack: MessageSender | null,
  langfuse?: LangfuseService | null,
): Tool {
  return {
    name: 'send_slack_blocks',
    description:
      'Send a formatted Slack message with blocks (rich formatting with sections, buttons, etc.). Use this for complex Slack messages.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'The channel ID to send the message to',
        },
        blocks: {
          type: 'array',
          description: 'Slack blocks array for formatting. See Slack Block Kit documentation.',
          items: {
            type: 'object',
          },
        },
      },
      required: ['chatId', 'blocks'],
    },
    execute: async (params: unknown) => {
      // Validate parameters
      const validation = validateToolParams(params, SCHEMAS.sendSlackBlocks);
      if (!validation.valid) {
        logger.warn('Invalid send_slack_blocks parameters', { error: validation.error });
        return {
          success: false,
          error: validation.error || 'Validation failed',
        };
      }

      const { chatId, blocks } = validation.data! as { chatId: string; blocks: unknown[] };

      try {
        if (!slack) {
          return {
            success: false,
            error: 'Slack service not available',
          };
        }

        await slack.sendMessage(chatId, '', { keyboard: blocks as MessageButton[][] });

        return {
          success: true,
          data: { message: 'Sent successfully' },
        };
      } catch (error) {
        logger.error('Failed to send Slack blocks', { chatId, error });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}
