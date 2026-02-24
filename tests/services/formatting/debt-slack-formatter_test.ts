/**
 * Tests for Slack debt formatter
 */

import { assert, assertEquals } from '@std/assert';
import { type Debt, DebtDirection, DebtStatus } from '../../../src/core/entity/debt.ts';
import { DebtSlackFormatter } from '../../../src/core/services/formatting/debt-slack-formatter.ts';

Deno.test('DebtSlackFormatter formats single debt item', () => {
  const formatter = new DebtSlackFormatter();

  const debt: Debt = {
    id: 'test-debt-id',
    userId: 'user-123',
    direction: DebtDirection.LENT,
    amount: 100,
    currency: 'USD',
    personName: 'John Doe',
    reason: 'Lunch money',
    status: DebtStatus.PENDING,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    debtDate: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  };

  const result = formatter.formatDebtItem(debt, false);

  assert(result.includes('John Doe'), 'Should include person name');
  assert(result.includes('100.00'), 'Should include amount');
  assert(result.includes('$'), 'Should include currency symbol');
  assert(result.includes(':hourglass: Pending'), 'Should include status');
  assert(result.includes('Lunch money'), 'Should include reason');
});

Deno.test('DebtSlackFormatter formats debt with ID when requested', () => {
  const formatter = new DebtSlackFormatter();

  const debt: Debt = {
    id: 'abc123-def456-ghi789',
    userId: 'user-123',
    direction: DebtDirection.LENT,
    amount: 50,
    currency: 'USD',
    personName: 'Jane',
    status: DebtStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = formatter.formatDebtItem(debt, true);

  assert(result.includes('#abc123-'), 'Should include truncated ID');
});

Deno.test('DebtSlackFormatter formats lent direction correctly', () => {
  const formatter = new DebtSlackFormatter();

  const debt: Debt = {
    id: 'test-id',
    userId: 'user-123',
    direction: DebtDirection.LENT,
    amount: 75,
    currency: 'USD',
    personName: 'Mike',
    status: DebtStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = formatter.formatDebtItem(debt, false);

  assert(result.includes(':moneybag: Lent to'), 'Should show lent emoji and text');
});

Deno.test('DebtSlackFormatter formats borrowed direction correctly', () => {
  const formatter = new DebtSlackFormatter();

  const debt: Debt = {
    id: 'test-id',
    userId: 'user-123',
    direction: DebtDirection.BORROWED,
    amount: 30,
    currency: 'USD',
    personName: 'Sarah',
    status: DebtStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = formatter.formatDebtItem(debt, false);

  assert(result.includes(':inbox_tray: Borrowed from'), 'Should show borrowed emoji and text');
});

Deno.test('DebtSlackFormatter formats paid status', () => {
  const formatter = new DebtSlackFormatter();

  const debt: Debt = {
    id: 'test-id',
    userId: 'user-123',
    direction: DebtDirection.LENT,
    amount: 100,
    currency: 'USD',
    personName: 'John',
    status: DebtStatus.PAID,
    createdAt: new Date(),
    paidAt: new Date('2024-01-20T10:00:00Z'),
    updatedAt: new Date(),
  };

  const result = formatter.formatDebtItem(debt, false);

  assert(result.includes(':white_check_mark: Paid'), 'Should show paid status');
  assert(result.includes('Paid on'), 'Should include paid date label');
});

Deno.test('DebtSlackFormatter formats cancelled status', () => {
  const formatter = new DebtSlackFormatter();

  const debt: Debt = {
    id: 'test-id',
    userId: 'user-123',
    direction: DebtDirection.LENT,
    amount: 100,
    currency: 'USD',
    personName: 'John',
    status: DebtStatus.CANCELLED,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = formatter.formatDebtItem(debt, false);

  assert(result.includes(':x: Cancelled'), 'Should show cancelled status');
});

Deno.test('DebtSlackFormatter formats debt list with multiple debts', () => {
  const formatter = new DebtSlackFormatter();

  const debts: Debt[] = [
    {
      id: 'debt-1',
      userId: 'user-123',
      direction: DebtDirection.LENT,
      amount: 100,
      currency: 'USD',
      personName: 'John',
      status: DebtStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'debt-2',
      userId: 'user-123',
      direction: DebtDirection.BORROWED,
      amount: 50,
      currency: 'USD',
      personName: 'Jane',
      status: DebtStatus.PAID,
      createdAt: new Date(),
      paidAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const result = formatter.formatDebtList(debts, '*My Debts*');

  assertEquals(result.length, 1, 'Should return single message for short list');
  assert(result[0].includes('*My Debts*'), 'Should include title');
  assert(result[0].includes('John'), 'Should include first debt');
  assert(result[0].includes('Jane'), 'Should include second debt');
});

Deno.test('DebtSlackFormatter formats empty debt list', () => {
  const formatter = new DebtSlackFormatter();

  const result = formatter.formatDebtList([], '*My Debts*');

  assertEquals(result.length, 1);
  assert(result[0].includes('No debts found'));
});

Deno.test('DebtSlackFormatter formats debt summary', () => {
  const formatter = new DebtSlackFormatter();

  const summary = {
    totalLent: 200,
    totalBorrowed: 100,
    totalLentPaid: 50,
    totalBorrowedPaid: 25,
    pendingLentCount: 3,
    pendingBorrowedCount: 2,
  };

  const result = formatter.formatDebtSummary(summary);

  assert(result.includes('*:moneybag: Debt Summary*'), 'Should include title');
  assert(result.includes('200.00'), 'Should include total lent');
  assert(result.includes('100.00'), 'Should include total borrowed');
  assert(result.includes('(3 pending)'), 'Should include pending lent count');
  assert(result.includes('(2 pending)'), 'Should include pending borrowed count');
});

Deno.test('DebtSlackFormatter shows positive net position', () => {
  const formatter = new DebtSlackFormatter();

  const summary = {
    totalLent: 200,
    totalBorrowed: 100,
    totalLentPaid: 0,
    totalBorrowedPaid: 0,
    pendingLentCount: 2,
    pendingBorrowedCount: 1,
  };

  const result = formatter.formatDebtSummary(summary);

  assert(result.includes(':large_green_circle:'), 'Should show green emoji for positive');
  assert(result.includes("You're owed"), 'Should say owed to user');
  assert(result.includes('100.00'), 'Should show net amount');
});

Deno.test('DebtSlackFormatter shows negative net position', () => {
  const formatter = new DebtSlackFormatter();

  const summary = {
    totalLent: 50,
    totalBorrowed: 200,
    totalLentPaid: 0,
    totalBorrowedPaid: 0,
    pendingLentCount: 1,
    pendingBorrowedCount: 3,
  };

  const result = formatter.formatDebtSummary(summary);

  assert(result.includes(':red_circle:'), 'Should show red emoji for negative');
  assert(result.includes('You owe'), 'Should say user owes');
});

Deno.test('DebtSlackFormatter shows settled up when net is zero', () => {
  const formatter = new DebtSlackFormatter();

  const summary = {
    totalLent: 0,
    totalBorrowed: 0,
    totalLentPaid: 100,
    totalBorrowedPaid: 100,
    pendingLentCount: 0,
    pendingBorrowedCount: 0,
  };

  const result = formatter.formatDebtSummary(summary);

  assert(result.includes(':white_circle:'), 'Should show white emoji for zero');
  assert(result.includes('All settled up'), 'Should say settled');
});

Deno.test('DebtSlackFormatter handles different currencies', () => {
  const formatter = new DebtSlackFormatter();

  const currencies = [
    { code: 'USD', symbol: '$' },
    { code: 'EUR', symbol: '€' },
    { code: 'GBP', symbol: '£' },
    { code: 'JPY', symbol: '¥' },
    { code: 'VND', symbol: '₫' },
  ];

  for (const { code, symbol } of currencies) {
    const debt: Debt = {
      id: 'test-id',
      userId: 'user-123',
      direction: DebtDirection.LENT,
      amount: 100,
      currency: code,
      personName: 'Test',
      status: DebtStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = formatter.formatDebtItem(debt, false);
    assert(result.includes(symbol), `Should include ${symbol} for ${code}`);
  }
});

Deno.test('DebtSlackFormatter uses asterisk for bold formatting', () => {
  const formatter = new DebtSlackFormatter();

  const summary = {
    totalLent: 100,
    totalBorrowed: 50,
    totalLentPaid: 0,
    totalBorrowedPaid: 0,
    pendingLentCount: 1,
    pendingBorrowedCount: 1,
  };

  const result = formatter.formatDebtSummary(summary);

  assert(result.includes('*'), 'Should use asterisk for bold');
});
