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
import { HUMAN_PROMPT, SYSTEM_PROMPT, dailyWorkSchema } from './prompts/daily-work-prompt.ts';
import {
  DEBT_HUMAN_PROMPT,
  DEBT_SYSTEM_PROMPT,
  debtParseSchema,
  toParsedDebtEntry,
} from './prompts/debt-prompt.ts';
import type { Capability, CapabilityResult } from './types.ts';

/**
 * Create a simple chat capability
 * Handles general conversation without expecting structured output
 */
export function createChatCapability(ai: GoogleGenAI): Capability {
  return {
    id: 'chat',
    name: 'Chat',
    description: 'General conversation capability for casual chat and questions',
    execute: async (input: unknown): Promise<CapabilityResult> => {
      try {
        const { input: message, verbose = false } = input as { input: string; verbose?: boolean };

        if (verbose) {
          logger.debug('Chat input', { message });
        }

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [{ text: message }],
            },
          ],
        });

        if (verbose) {
          logger.debug('Chat response', { response: response.text });
        }

        if (!response.text) {
          return {
            success: false,
            error: 'No response from AI model',
          };
        }

        // Return the plain text response directly
        return {
          success: true,
          data: response.text,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  };
}

/**
 * Create a daily work report capability
 * Parses natural language and generates structured work reports
 */
export function createDailyWorkReportCapability(ai: GoogleGenAI): Capability {
  return {
    id: 'daily-work-report',
    name: 'Daily Work Report',
    description:
      'Parse natural language and generate structured daily work reports with completed, incomplete, and planned tasks',
    execute: async (input: unknown): Promise<CapabilityResult> => {
      try {
        const { input: message, verbose = false } = input as { input: string; verbose?: boolean };

        if (verbose) {
          logger.debug('Daily work report input', { message });
        }

        const response = await ai.models.generateContent({
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

        if (verbose) {
          logger.debug('Daily work report response', { response: response.text });
        }

        if (!response.text) {
          return {
            success: false,
            error: 'No response from AI model',
          };
        }

        const parsedResponse = JSON.parse(response.text) as DailyWorkReport;

        return {
          success: true,
          data: parsedResponse,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  };
}

/**
 * Create a parse debt entry capability
 * Parses natural language debt descriptions into structured data
 */
export function createParseDebtCapability(ai: GoogleGenAI): Capability {
  return {
    id: 'parse-debt-entry',
    name: 'Parse Debt Entry',
    description:
      'Parse natural language debt descriptions into structured data with direction, amount, person, and reason',
    execute: async (input: unknown): Promise<CapabilityResult> => {
      try {
        const { input: debtInput } = input as { input: string };

        const response = await ai.models.generateContent({
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

        if (!response.text) {
          return {
            success: false,
            error: 'No response from AI model',
          };
        }

        const parsed = JSON.parse(response.text);

        // Validate required fields
        if (!parsed.direction || typeof parsed.amount !== 'number' || !parsed.person) {
          return {
            success: false,
            error: 'Invalid debt parsing response',
          };
        }

        const debtEntry = toParsedDebtEntry(parsed);

        return {
          success: true,
          data: debtEntry,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  };
}

/**
 * Get all available capabilities
 * Add new capabilities here as needed
 */
export function getAllCapabilities(ai: GoogleGenAI): Capability[] {
  return [
    createChatCapability(ai),
    createDailyWorkReportCapability(ai),
    createParseDebtCapability(ai),
  ];
}

/**
 * Get a capability by ID
 */
export function getCapabilityById(ai: GoogleGenAI, id: string): Capability | undefined {
  const capabilities = getAllCapabilities(ai);
  return capabilities.find((c) => c.id === id);
}
