/**
 * Debt Entry Prompts
 *
 * Prompts for parsing natural language debt entries into structured data.
 */

import { DebtDirection, ParsedDebtEntry } from '../../../entity/debt.ts';
import { SchemaType } from '../types.ts';

/**
 * System prompt for parsing debt entries
 */
export const DEBT_SYSTEM_PROMPT = `
You are a debt tracking assistant. Your role is to parse natural language descriptions of debts into structured data.

Parse the user input and extract:
1. Direction: Whether money was LENT (you gave money, they owe you) or BORROWED (you took money, you owe them)
2. Amount: The numerical amount
3. Person: The name of the person involved
4. Reason: Optional context/reason for the debt
5. Currency: Optional currency code (default to USD if not specified)

Rules:
- "lent", "gave", "loaned" → LENT
- "borrowed", "took", "owe" → BORROWED
- Extract the person's name (usually after "to" or "from")
- If no currency is specified, use "USD"
- If reason is unclear, set it to null
- Amount should always be a positive number

Examples:
Input: "lent 50 to John for lunch"
Output: {"direction": "lent", "amount": 50, "person": "John", "reason": "lunch", "currency": "USD"}

Input: "borrowed $20 from Sarah for taxi"
Output: {"direction": "borrowed", "amount": 20, "person": "Sarah", "reason": "taxi", "currency": "USD"}

Input: "gave 100 EUR to Mike for concert tickets"
Output: {"direction": "lent", "amount": 100, "person": "Mike", "reason": "concert tickets", "currency": "EUR"}

Input: "owe Alice 15 for coffee"
Output: {"direction": "borrowed", "amount": 15, "person": "Alice", "reason": "coffee", "currency": "USD"}
`;

/**
 * Human prompt template for debt parsing
 */
export const DEBT_HUMAN_PROMPT = (input: string): string => `
Parse the following debt entry:

${input}
`;

/**
 * JSON schema for debt parsing response
 */
export const debtParseSchema = {
  description: 'Debt entry parsing result',
  type: SchemaType.OBJECT,
  properties: {
    direction: {
      type: SchemaType.STRING,
      description: 'Either "lent" or "borrowed"',
      enum: ['lent', 'borrowed'],
      nullable: false,
    },
    amount: {
      type: SchemaType.NUMBER,
      description: 'The amount of money (positive number)',
      nullable: false,
    },
    person: {
      type: SchemaType.STRING,
      description: 'Name of the person involved',
      nullable: false,
    },
    reason: {
      type: SchemaType.STRING,
      description: 'Reason for the debt (optional)',
      nullable: true,
    },
    currency: {
      type: SchemaType.STRING,
      description: 'Currency code (default: USD)',
      nullable: true,
    },
  },
  required: ['direction', 'amount', 'person'],
} as const;

/**
 * Type for the parsed debt response from AI
 */
export interface DebtParseResponse {
  direction: 'lent' | 'borrowed';
  amount: number;
  person: string;
  reason?: string;
  currency?: string;
}

/**
 * Convert AI response to ParsedDebtEntry
 */
export function toParsedDebtEntry(response: DebtParseResponse): ParsedDebtEntry {
  return {
    direction: response.direction === 'lent' ? DebtDirection.LENT : DebtDirection.BORROWED,
    amount: response.amount,
    person: response.person,
    reason: response.reason,
    currency: response.currency || 'USD',
  };
}
