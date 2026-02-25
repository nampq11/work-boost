/**
 * Brain Tools - Function Calling Capabilities
 *
 * Instead of LLM returning structured JSON that we parse,
 * the LLM calls these tools directly with platform-specific parameters.
 *
 * Following agent-builder philosophy:
 * > Give the model capabilities and let it reason.
 */

import type { BotService, KeyboardButton } from '../bot/bot-service.ts';
import { logger } from '../logger/logger.ts';
import type { LangfuseService } from '../observability/langfuse/langfuse.ts';
import type { Slack } from '../services/slack/slack.ts';
import type { TelegramService } from '../services/telegram/telegram.ts';
import type { SendMessageParams, Tool, ToolPlatform } from './types.ts';
import { SCHEMAS, validateToolParams } from './validation.ts';

/**
 * Create a send_message tool
 * Sends a text message to either Slack or Telegram
 */
export function createSendMessageTool(
  slack: Slack | null,
  telegram: TelegramService | null,
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

      const { platform, chatId, text, parseMode } = validation.data! as SendMessageParams;

      const startTime = Date.now();

      // Create span for tool execution if Langfuse is enabled
      let span: ReturnType<ReturnType<LangfuseService['createTrace']>['span']> | null = null;
      if (langfuse?.isEnabled()) {
        const trace = langfuse.createTrace({
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

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Create a send_slack_blocks tool
 * Sends a formatted Slack message with blocks
 */
export function createSendSlackBlocksTool(
  slack: Slack | null,
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

        await slack.sendMessage(chatId, '', { keyboard: blocks as KeyboardButton[][] });

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

/**
 * Create a send_telegram_keyboard tool
 * Sends a Telegram message with inline keyboard
 */
export function createSendTelegramKeyboardTool(
  telegram: TelegramService | null,
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
        keyboard: KeyboardButton[][];
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

/**
 * Create a format_daily_report tool
 * Formats a daily work report for display
 */
export function createFormatDailyReportTool(): Tool {
  return {
    name: 'format_daily_report',
    description:
      'Format a daily work report into a readable text message. Takes completed, incomplete, and planned tasks.',
    parameters: {
      type: 'object',
      properties: {
        completed: {
          type: 'array',
          description: 'List of completed tasks with project and task fields',
          items: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              task: { type: 'string' },
            },
          },
        },
        incomplete: {
          type: 'array',
          description: 'List of incomplete tasks with project and task fields',
          items: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              task: { type: 'string' },
            },
          },
        },
        planned: {
          type: 'array',
          description: 'List of planned tasks with project and task fields',
          items: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              task: { type: 'string' },
            },
          },
        },
      },
      required: ['completed', 'incomplete', 'planned'],
    },
    execute: async (params: unknown) => {
      // Validate parameters
      const validation = validateToolParams(params, SCHEMAS.formatDailyReport);
      if (!validation.valid) {
        logger.warn('Invalid format_daily_report parameters', { error: validation.error });
        return {
          success: false,
          error: validation.error || 'Validation failed',
        };
      }

      const { completed, incomplete, planned } = validation.data! as {
        completed: Array<{ project: string; task: string }>;
        incomplete: Array<{ project: string; task: string }>;
        planned: Array<{ project: string; task: string }>;
      };

      const formatTasks = (tasks: Array<{ project: string; task: string }>) => {
        if (tasks.length === 0) return ' •  N/A';
        return tasks
          .map((t) => {
            return ` •  ${t.project}: ${t.task}`;
          })
          .join('\n');
      };

      const text = `1. Việc hoàn thành hôm trước?
${formatTasks(completed)}
2. Việc dự định làm hôm trước nhưng không hoàn thành?
${formatTasks(incomplete)}
3. Việc dự định làm hôm nay?
${formatTasks(planned)}`;

      return {
        success: true,
        data: { text },
      };
    },
  };
}

/**
 * Create a format_debt_entry tool
 * Formats a debt entry for display
 */
export function createFormatDebtEntryTool(): Tool {
  return {
    name: 'format_debt_entry',
    description:
      'Format a debt entry into a readable text message. Takes direction, amount, currency, person, and reason.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['lent', 'borrowed'],
          description: 'Whether money was lent or borrowed',
        },
        amount: {
          type: 'number',
          description: 'The amount of money',
        },
        currency: {
          type: 'string',
          description: 'The currency code (e.g., USD, VND)',
        },
        person: {
          type: 'string',
          description: 'The person name',
        },
        reason: {
          type: 'string',
          description: 'The reason for the debt (optional)',
        },
      },
      required: ['direction', 'amount', 'currency', 'person'],
    },
    execute: async (params: unknown) => {
      // Validate parameters
      const validation = validateToolParams(params, SCHEMAS.formatDebtEntry);
      if (!validation.valid) {
        logger.warn('Invalid format_debt_entry parameters', { error: validation.error });
        return {
          success: false,
          error: validation.error || 'Validation failed',
        };
      }

      const { direction, amount, currency, person, reason } = validation.data! as {
        direction: 'lent' | 'borrowed';
        amount: number;
        currency: string;
        person: string;
        reason?: string;
      };

      const directionText = direction === 'lent' ? 'Cho vay' : 'Đi vay';
      const reasonText = reason ? ` (lý do: ${reason})` : '';
      const text = `${directionText}: ${amount} ${currency} ${person}${reasonText}`;

      return {
        success: true,
        data: { text },
      };
    },
  };
}

/**
 * Get all available tools
 */
export function getAllTools(
  slack: Slack | null,
  telegram: TelegramService | null,
  langfuse?: LangfuseService | null,
): Tool[] {
  return [
    createSendMessageTool(slack, telegram, langfuse),
    createSendSlackBlocksTool(slack, langfuse),
    createSendTelegramKeyboardTool(telegram, langfuse),
    createFormatDailyReportTool(),
    createFormatDebtEntryTool(),
  ];
}

/**
 * Get tool schema for LLM function calling
 * Returns the tools in the format expected by Gemini API
 */
export function getToolSchemas(tools: Tool[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/**
 * Execute a tool call
 */
export async function executeToolCall(
  tools: Tool[],
  toolCall: { name: string; parameters: Record<string, unknown> },
): Promise<unknown> {
  const tool = tools.find((t) => t.name === toolCall.name);

  if (!tool) {
    return {
      success: false,
      error: `Tool not found: ${toolCall.name}`,
    };
  }

  return tool.execute(toolCall.parameters);
}
