/**
 * Brain Architecture Types
 *
 * Following the agent-builder philosophy:
 * - The model IS the agent
 * - Capabilities enable (what it CAN do)
 * - Knowledge informs (what it KNOWS)
 * - Context connects (what has happened)
 */

import type { GoogleGenAI } from '@google/genai';
import type { MessageButton } from './ports/messaging.ts';

/**
 * A message in the conversation
 */
export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp?: Date;
}

/**
 * Conversation context - the thread connecting actions
 */
export interface Context {
  sessionId: string;
  messages: Message[];
  createdAt: Date;
  lastUsedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * A capability - atomic action the brain can perform
 */
export interface Capability {
  id: string;
  name: string;
  description: string;
  execute: (input: unknown) => Promise<CapabilityResult>;
}

/**
 * Result of executing a capability
 */
export interface CapabilityResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Knowledge source - domain expertise loaded on-demand
 */
export interface Knowledge {
  id: string;
  name: string;
  description: string;
  load: () => Promise<string>;
  loaded?: boolean;
  content?: string;
}

/**
 * Brain configuration
 */
export interface BrainConfig {
  model: string;
  maxTokens?: number;
  temperature?: number;
  apiKey: string;
  sessionTTL?: number; // Session time-to-live in milliseconds (default: 24 hours)
}

/**
 * Brain run result
 */
export interface BrainRunResult {
  response: string;
  backgroundOperations?: Promise<void>;
  thoughts?: string[];
  toolCalls?: ToolCall[];
}

/**
 * Tool definition for function calling
 */
export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  execute: (params: unknown) => Promise<ToolResult>;
}

/**
 * Tool call from LLM
 */
export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Platform for sending messages
 */
export type ToolPlatform = 'slack' | 'telegram';

/**
 * Message send options for tools
 */
export interface SendMessageParams {
  platform: ToolPlatform;
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'None';
  keyboard?: MessageButton[][];
}
