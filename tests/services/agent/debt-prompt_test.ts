/**
 * Tests for debt parsing prompts and helpers
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import {
  DEBT_HUMAN_PROMPT,
  DEBT_SYSTEM_PROMPT,
  type DebtParseResponse,
  debtParseSchema,
  toParsedDebtEntry,
} from '../../../src/core/brain/prompts/debt-prompt.ts';
import { DebtDirection, type ParsedDebtEntry } from '../../../src/core/entity/debt.ts';

Deno.test('DEBT_SYSTEM_PROMPT contains required instructions', () => {
  assertExists(DEBT_SYSTEM_PROMPT);
  assertEquals(typeof DEBT_SYSTEM_PROMPT, 'string');

  // Check for key phrases
  assert(DEBT_SYSTEM_PROMPT.includes('lent'), 'Should mention "lent"');
  assert(DEBT_SYSTEM_PROMPT.includes('borrowed'), 'Should mention "borrowed"');
  assert(DEBT_SYSTEM_PROMPT.includes('amount'), 'Should mention "amount"');
  assert(DEBT_SYSTEM_PROMPT.includes('person'), 'Should mention "person"');
});

Deno.test('DEBT_HUMAN_PROMPT wraps input correctly', () => {
  const input = 'lent 50 to John for lunch';
  const result = DEBT_HUMAN_PROMPT(input);

  assert(result.includes(input), 'Should include the input text');
  assert(result.includes('Parse the following debt entry'), 'Should include instructions');
});

Deno.test('debtParseSchema has correct structure', () => {
  assertEquals(debtParseSchema.type, 'object');
  assertEquals(debtParseSchema.description, 'Debt entry parsing result');

  assertExists(debtParseSchema.properties);
  assertExists(debtParseSchema.properties.direction);
  assertExists(debtParseSchema.properties.amount);
  assertExists(debtParseSchema.properties.person);
  assertExists(debtParseSchema.properties.reason);
  assertExists(debtParseSchema.properties.currency);

  // Check required fields
  assert(Array.isArray(debtParseSchema.required));
  assert(debtParseSchema.required.includes('direction'));
  assert(debtParseSchema.required.includes('amount'));
  assert(debtParseSchema.required.includes('person'));
});

Deno.test('debtParseSchema direction enum has correct values', () => {
  const direction = debtParseSchema.properties.direction as unknown as {
    enum: string[];
  };

  assertExists(direction.enum);
  assert(direction.enum.includes('lent'));
  assert(direction.enum.includes('borrowed'));
});

Deno.test('toParsedDebtEntry converts lent direction correctly', () => {
  const response: DebtParseResponse = {
    direction: 'lent',
    amount: 100,
    person: 'John Doe',
    reason: 'Lunch',
    currency: 'USD',
  };

  const result = toParsedDebtEntry(response);

  assertEquals(result.direction, DebtDirection.LENT);
  assertEquals(result.amount, 100);
  assertEquals(result.person, 'John Doe');
  assertEquals(result.reason, 'Lunch');
  assertEquals(result.currency, 'USD');
});

Deno.test('toParsedDebtEntry converts borrowed direction correctly', () => {
  const response: DebtParseResponse = {
    direction: 'borrowed',
    amount: 50,
    person: 'Jane Smith',
    reason: 'Coffee',
    currency: 'EUR',
  };

  const result = toParsedDebtEntry(response);

  assertEquals(result.direction, DebtDirection.BORROWED);
  assertEquals(result.amount, 50);
  assertEquals(result.person, 'Jane Smith');
  assertEquals(result.reason, 'Coffee');
  assertEquals(result.currency, 'EUR');
});

Deno.test('toParsedDebtEntry defaults to USD when no currency provided', () => {
  const response: DebtParseResponse = {
    direction: 'lent',
    amount: 75,
    person: 'Mike',
  };

  const result = toParsedDebtEntry(response);

  assertEquals(result.currency, 'USD');
});

Deno.test('toParsedDebtEntry handles optional reason field', () => {
  const withReason: DebtParseResponse = {
    direction: 'borrowed',
    amount: 25,
    person: 'Sarah',
    reason: 'Taxi',
  };

  const withResult = toParsedDebtEntry(withReason);
  assertEquals(withResult.reason, 'Taxi');

  const withoutReason: DebtParseResponse = {
    direction: 'lent',
    amount: 30,
    person: 'Tom',
  };

  const withoutResult = toParsedDebtEntry(withoutReason);
  assertEquals(withoutResult.reason, undefined);
});

Deno.test('DEBT_HUMAN_PROMPT handles empty input', () => {
  const result = DEBT_HUMAN_PROMPT('');

  assertExists(result);
  assert(result.length > 0);
});

Deno.test('DEBT_HUMAN_PROMPT handles special characters in input', () => {
  const input = 'lent $50 to José-Martínez for café';
  const result = DEBT_HUMAN_PROMPT(input);

  assert(result.includes(input), 'Should preserve special characters');
});

Deno.test('DebtParseResponse type structure is correct', () => {
  const response: DebtParseResponse = {
    direction: 'lent',
    amount: 100,
    person: 'John',
    reason: 'Test',
    currency: 'GBP',
  };

  assertEquals(typeof response.direction, 'string');
  assertEquals(typeof response.amount, 'number');
  assertEquals(typeof response.person, 'string');
  // reason and currency are optional
});
