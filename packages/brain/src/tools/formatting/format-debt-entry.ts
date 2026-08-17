/**
 * Format Debt Entry Tool
 *
 * Formats a debt entry for display
 */

import { logger } from '@work-boost/shared/logger/logger.ts';
import type { Tool } from '../../types.ts';
import { validateToolParams } from '../../validation.ts';
import { SCHEMAS } from '../../validation.ts';

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
