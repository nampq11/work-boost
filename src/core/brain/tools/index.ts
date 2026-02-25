/**
 * Brain Tools - Function Calling Capabilities
 *
 * Instead of LLM returning structured JSON that we parse,
 * the LLM calls these tools directly with platform-specific parameters.
 *
 * Following agent-builder philosophy:
 * > Give the model capabilities and let it reason.
 *
 * Module structure:
 * - messaging/: Tools for sending messages to Slack and Telegram
 * - formatting/: Tools for formatting data into readable messages
 * - database/: Tools for querying and manipulating database entities
 */

import { logger } from '../../logger/logger.ts';
import type { LangfuseService } from '../../observability/langfuse/langfuse.ts';
import type { Slack } from '../../services/slack/slack.ts';
import type { TelegramService } from '../../services/telegram/telegram.ts';
import type { Database } from '../../storage/database.ts';
import type { Tool } from '../types.ts';

// Messaging tools
export {
  createSendMessageTool,
  createSendSlackBlocksTool,
  createSendTelegramKeyboardTool,
} from './messaging/index.ts';

// Formatting tools
export { createFormatDailyReportTool, createFormatDebtEntryTool } from './formatting/index.ts';

// Database tools
export {
  createCreateDebtTool,
  createDeleteDebtTool,
  createQueryDebtTool,
  createQueryTaskTool,
  createQueryUserTool,
  createUpdateDebtTool,
  getDatabaseTools,
} from './database/index.ts';

// Types
export type {
  CreateDebtParams,
  CreateTaskParams,
  QueryDebtParams,
  QueryTaskParams,
  QueryUserParams,
  UpdateDebtParams,
  UpdateTaskParams,
} from './types.ts';

// Re-export Tool type for convenience
export type { Tool } from '../types.ts';

// Import all tool creators dynamically
import { createFormatDailyReportTool, createFormatDebtEntryTool } from './formatting/index.ts';
import {
  createCreateDebtTool,
  createDeleteDebtTool,
  createQueryDebtTool,
  createQueryTaskTool,
  createQueryUserTool,
  createUpdateDebtTool,
} from './database/index.ts';
import { createSendMessageTool } from './messaging/send-message.ts';
import { createSendSlackBlocksTool } from './messaging/slack-blocks.ts';
import { createSendTelegramKeyboardTool } from './messaging/telegram-keyboard.ts';

/**
 * Get all available tools
 *
 * Collects all tools from messaging, formatting, and (optionally) database modules.
 */
export function getAllTools(
  slack: Slack | null,
  telegram: TelegramService | null,
  langfuse?: LangfuseService | null,
  db?: Database,
): Tool[] {
  const tools: Tool[] = [
    // Messaging tools
    createSendMessageTool(slack, telegram, langfuse),
    createSendSlackBlocksTool(slack, langfuse),
    createSendTelegramKeyboardTool(telegram, langfuse),
    // Formatting tools
    createFormatDailyReportTool(),
    createFormatDebtEntryTool(),
  ];

  // Add database tools if Database instance is provided
  if (db) {
    tools.push(
      createQueryUserTool(db),
      createQueryTaskTool(db),
      createQueryDebtTool(db),
      createCreateDebtTool(db),
      createUpdateDebtTool(db),
      createDeleteDebtTool(db),
    );
  }

  return tools;
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
