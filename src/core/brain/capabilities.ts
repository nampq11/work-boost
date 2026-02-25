/**
 * Brain Capabilities
 *
 * Atomic actions the brain can perform.
 * Start with 3-5 capabilities. Add more only when the brain
 * consistently fails because a capability is missing.
 */

import { GoogleGenAI } from '@google/genai';
import type { DailyWorkReport } from '../entity/agent.ts';
import type { ParsedDebtEntry } from '../entity/debt.ts';
import { logger } from '../logger/logger.ts';
import type { LangfuseService } from '../observability/langfuse/langfuse.ts';
import { dailyWorkSchema, HUMAN_PROMPT, SYSTEM_PROMPT } from './prompts/daily-work-prompt.ts';
import {
  DEBT_HUMAN_PROMPT,
  DEBT_SYSTEM_PROMPT,
  debtParseSchema,
  toParsedDebtEntry,
} from './prompts/debt-prompt.ts';
import type { Capability, CapabilityResult } from './types.ts';

/**
 * Helper to trace LLM generation with Langfuse
 */
async function traceLLMCall<T>(
  langfuse: LangfuseService | null,
  options: {
    modelName: string;
    input: unknown;
    execute: () => Promise<{
      text?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }>;
    parseResponse: (text: string) => T;
    metadata?: Record<string, unknown>;
  },
): Promise<{ success: boolean; data?: T; error?: string }> {
  const startTime = Date.now();

  if (!langfuse?.isEnabled()) {
    // No tracing, just execute
    try {
      const response = await options.execute();
      if (!response.text) {
        return { success: false, error: 'No response from AI model' };
      }
      const data = options.parseResponse(response.text);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  // With tracing
  const trace = langfuse.createTrace({
    name: `llm_${options.modelName}`,
    input: options.input,
    metadata: options.metadata,
  });

  const generation = trace.generation({
    name: options.modelName,
    model: options.modelName,
    startTime,
  });

  try {
    const response = await options.execute();

    if (!response.text) {
      generation.update({ output: { error: 'No response from AI model' } });
      generation.end();
      return { success: false, error: 'No response from AI model' };
    }

    const data = options.parseResponse(response.text);

    // Update generation with response data
    generation.update({
      output: response.text,
      usageDetails: {
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
      metadata: options.metadata,
    });

    generation.end();

    // Flush trace asynchronously (fire and forget)
    langfuse.flush().catch((error) => {
      logger.warn('Failed to flush Langfuse trace', { error });
    });

    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    generation.update({
      output: { error: errorMessage },
      metadata: { ...options.metadata, error: errorMessage },
    });
    generation.end();

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Create a simple chat capability
 * Handles general conversation without expecting structured output
 */
export function createChatCapability(
  ai: GoogleGenAI,
  langfuse: LangfuseService | null = null,
): Capability {
  return {
    id: 'chat',
    name: 'Chat',
    description: 'General conversation capability for casual chat and questions',
    execute: async (input: unknown): Promise<CapabilityResult> => {
      const { input: message, verbose = false } = input as { input: string; verbose?: boolean };

      if (verbose) {
        logger.debug('Chat input', { message });
      }

      return traceLLMCall(langfuse, {
        modelName: 'gemini-2.5-flash',
        input: { message },
        execute: async () => {
          return await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                role: 'user',
                parts: [{ text: message }],
              },
            ],
          });
        },
        parseResponse: (text) => text, // Return plain text
        metadata: { capability: 'chat' },
      });
    },
  };
}

/**
 * Create a daily work report capability
 * Parses natural language and generates structured work reports
 */
export function createDailyWorkReportCapability(
  ai: GoogleGenAI,
  langfuse: LangfuseService | null = null,
): Capability {
  return {
    id: 'daily-work-report',
    name: 'Daily Work Report',
    description:
      'Parse natural language and generate structured daily work reports with completed, incomplete, and planned tasks',
    execute: async (input: unknown): Promise<CapabilityResult> => {
      const { input: message, verbose = false } = input as { input: string; verbose?: boolean };

      if (verbose) {
        logger.debug('Daily work report input', { message });
      }

      return traceLLMCall(langfuse, {
        modelName: 'gemini-2.5-flash',
        input: { message },
        execute: async () => {
          return await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                role: 'model',
                parts: [{ text: SYSTEM_PROMPT }],
              },
              {
                role: 'user',
                parts: [{ text: HUMAN_PROMPT.replace('{USER_INPUT}', message) }],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: dailyWorkSchema,
            },
          });
        },
        parseResponse: (text) => JSON.parse(text) as DailyWorkReport,
        metadata: { capability: 'daily-work-report' },
      });
    },
  };
}

/**
 * Create a parse debt entry capability
 * Parses natural language debt descriptions into structured data
 */
export function createParseDebtCapability(
  ai: GoogleGenAI,
  langfuse: LangfuseService | null = null,
): Capability {
  return {
    id: 'parse-debt-entry',
    name: 'Parse Debt Entry',
    description:
      'Parse natural language debt descriptions into structured data with direction, amount, person, and reason',
    execute: async (input: unknown): Promise<CapabilityResult> => {
      const { input: debtInput } = input as { input: string };

      const result = await traceLLMCall(langfuse, {
        modelName: 'gemini-2.5-flash',
        input: { debtInput },
        execute: async () => {
          return await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                role: 'model',
                parts: [{ text: DEBT_SYSTEM_PROMPT }],
              },
              {
                role: 'user',
                parts: [{ text: DEBT_HUMAN_PROMPT(debtInput) }],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: debtParseSchema,
            },
          });
        },
        parseResponse: (text) => {
          const parsed = JSON.parse(text);

          // Validate required fields
          if (!parsed.direction || typeof parsed.amount !== 'number' || !parsed.person) {
            throw new Error('Invalid debt parsing response');
          }

          return toParsedDebtEntry(parsed);
        },
        metadata: { capability: 'parse-debt-entry' },
      });

      return result;
    },
  };
}

/**
 * Get all available capabilities
 * Add new capabilities here as needed
 */
export function getAllCapabilities(
  ai: GoogleGenAI,
  langfuse: LangfuseService | null = null,
): Capability[] {
  return [
    createChatCapability(ai, langfuse),
    createDailyWorkReportCapability(ai, langfuse),
    createParseDebtCapability(ai, langfuse),
  ];
}

/**
 * Get a capability by ID
 */
export function getCapabilityById(
  ai: GoogleGenAI,
  id: string,
  langfuse: LangfuseService | null = null,
): Capability | undefined {
  const capabilities = getAllCapabilities(ai, langfuse);
  return capabilities.find((c) => c.id === id);
}
