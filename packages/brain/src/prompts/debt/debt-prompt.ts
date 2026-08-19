/**
 * Debt Entry Prompts
 *
 * Prompts for parsing natural language debt entries into structured data.
 */

import { type Static, StringEnum, Type } from '@earendil-works/pi-ai';
import { DebtDirection, type ParsedDebtEntry } from '@work-boost/data-schemas/debt.ts';

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
 * TypeBox schema for the debt parsing response.
 * The model is steered toward this schema via the response tool in
 * completeStructured, and validated against it before returning.
 */
export const debtParseSchema = Type.Object(
  {
    direction: StringEnum(['lent', 'borrowed'], { description: 'Either "lent" or "borrowed"' }),
    amount: Type.Number({ description: 'The amount of money (positive number)' }),
    person: Type.String({ description: 'Name of the person involved' }),
    reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    currency: Type.Optional(Type.String({ description: 'Currency code (default: USD)' })),
  },
  { description: 'Debt entry parsing result' },
);

/**
 * Type for the parsed debt response from AI
 */
export type DebtParseResponse = Static<typeof debtParseSchema>;

/**
 * Convert AI response to ParsedDebtEntry
 */
export function toParsedDebtEntry(response: DebtParseResponse): ParsedDebtEntry {
  return {
    direction: response.direction === 'lent' ? DebtDirection.LENT : DebtDirection.BORROWED,
    amount: response.amount,
    person: response.person,
    reason: response.reason ?? undefined,
    currency: response.currency ?? 'USD',
  };
}
