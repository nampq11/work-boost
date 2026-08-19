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
} from '@work-boost/brain';
import { DebtDirection } from '@work-boost/data-schemas/debt.ts';
import { Value } from 'typebox/value';

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

Deno.test('debtParseSchema accepts a full valid payload', () => {
  const payload = {
    direction: 'lent',
    amount: 100,
    person: 'Alice',
    reason: 'lunch',
    currency: 'VND',
  };
  assertEquals(Value.Check(debtParseSchema, payload), true);
});

Deno.test('debtParseSchema accepts a minimal payload', () => {
  const payload = { direction: 'borrowed', amount: 5.5, person: 'Bob' };
  assertEquals(Value.Check(debtParseSchema, payload), true);
});

Deno.test('debtParseSchema accepts null reason', () => {
  const payload = { direction: 'lent', amount: 1, person: 'C', reason: null };
  assertEquals(Value.Check(debtParseSchema, payload), true);
});

Deno.test('debtParseSchema rejects an unknown direction', () => {
  const payload = { direction: 'gifted', amount: 1, person: 'C' };
  assertEquals(Value.Check(debtParseSchema, payload), false);
});

Deno.test('debtParseSchema rejects a missing amount', () => {
  const payload = { direction: 'lent', person: 'C' };
  assertEquals(Value.Check(debtParseSchema, payload), false);
});

Deno.test('debtParseSchema rejects a non-string person', () => {
  const payload = { direction: 'lent', amount: 1, person: 42 };
  assertEquals(Value.Check(debtParseSchema, payload), false);
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
