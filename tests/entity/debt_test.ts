/**
 * Tests for debt entity types and enums
 */

import { assertEquals, assertExists } from '@std/assert';
import {
  type Debt,
  DebtDirection,
  type DebtFilterOptions,
  type DebtReminderSettings,
  DebtStatus,
  type ParsedDebtEntry,
} from '@work-boost/data-schemas/debt.ts';

Deno.test('DebtDirection enum has correct values', () => {
  assertEquals(DebtDirection.LENT, 'lent');
  assertEquals(DebtDirection.BORROWED, 'borrowed');
});

Deno.test('DebtStatus enum has correct values', () => {
  assertEquals(DebtStatus.PENDING, 'pending');
  assertEquals(DebtStatus.PAID, 'paid');
  assertEquals(DebtStatus.CANCELLED, 'cancelled');
});

Deno.test('Debt interface can be instantiated', () => {
  const debt: Debt = {
    id: 'test-id',
    userId: 'user-123',
    direction: DebtDirection.LENT,
    amount: 100,
    currency: 'USD',
    personName: 'John Doe',
    reason: 'Lunch',
    status: DebtStatus.PENDING,
    createdAt: new Date(),
    debtDate: new Date(),
    paidAt: undefined,
    updatedAt: new Date(),
  };

  assertEquals(debt.id, 'test-id');
  assertEquals(debt.userId, 'user-123');
  assertEquals(debt.direction, DebtDirection.LENT);
  assertEquals(debt.amount, 100);
  assertEquals(debt.currency, 'USD');
  assertEquals(debt.personName, 'John Doe');
  assertEquals(debt.reason, 'Lunch');
  assertEquals(debt.status, DebtStatus.PENDING);
  assertExists(debt.createdAt);
  assertExists(debt.updatedAt);
});

Deno.test('DebtReminderSettings interface can be instantiated', () => {
  const settings: DebtReminderSettings = {
    userId: 'user-123',
    enabled: true,
    frequency: 'weekly',
    weeklyDay: 1,
    monthlyDay: undefined,
    reminderHour: 9,
    lastReminderSentAt: new Date(),
    updatedAt: new Date(),
  };

  assertEquals(settings.userId, 'user-123');
  assertEquals(settings.enabled, true);
  assertEquals(settings.frequency, 'weekly');
  assertEquals(settings.weeklyDay, 1);
  assertEquals(settings.reminderHour, 9);
  assertExists(settings.updatedAt);
});

Deno.test('DebtFilterOptions interface can be instantiated', () => {
  const filter1: DebtFilterOptions = {};
  const filter2: DebtFilterOptions = { status: DebtStatus.PENDING };
  const filter3: DebtFilterOptions = {
    status: DebtStatus.PENDING,
    direction: DebtDirection.LENT,
    personName: 'John',
    limit: 10,
  };

  assertExists(filter1);
  assertEquals(filter2.status, DebtStatus.PENDING);
  assertEquals(filter3.status, DebtStatus.PENDING);
  assertEquals(filter3.direction, DebtDirection.LENT);
  assertEquals(filter3.personName, 'John');
  assertEquals(filter3.limit, 10);
});

Deno.test('ParsedDebtEntry interface can be instantiated', () => {
  const parsed: ParsedDebtEntry = {
    direction: DebtDirection.LENT,
    amount: 50,
    person: 'Jane',
    reason: 'Coffee',
    currency: 'USD',
  };

  assertEquals(parsed.direction, DebtDirection.LENT);
  assertEquals(parsed.amount, 50);
  assertEquals(parsed.person, 'Jane');
  assertEquals(parsed.reason, 'Coffee');
  assertEquals(parsed.currency, 'USD');
});

Deno.test('ParsedDebtEntry can have optional fields', () => {
  const minimal: ParsedDebtEntry = {
    direction: DebtDirection.BORROWED,
    amount: 25,
    person: 'Mike',
    currency: 'EUR',
  };

  assertEquals(minimal.direction, DebtDirection.BORROWED);
  assertEquals(minimal.amount, 25);
  assertEquals(minimal.person, 'Mike');
  assertEquals(minimal.currency, 'EUR');
});
