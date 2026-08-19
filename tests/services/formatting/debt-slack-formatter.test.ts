/**
 * Tests for Slack debt formatter
 */

import { assert, assertEquals } from '@std/assert';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { DebtSlackFormatter } from '@work-boost/services';

function makeDebt(
  overrides: Partial<{
    id: string;
    direction: DebtDirection;
    amount: number;
    currency: string;
    personName: string;
    reason: string;
    status: DebtStatus;
    debtDate: string;
    paidAt: string | null;
  }> = {},
): DebtDocument {
  const {
    id = 'test-debt-id',
    direction = DebtDirection.LENT,
    amount = 100,
    currency = 'USD',
    personName = 'John Doe',
    reason = 'Lunch money',
    status = DebtStatus.PENDING,
    debtDate = '2024-01-15',
    paidAt = null,
  } = overrides;

  return {
    frontmatter: {
      id,
      direction,
      amount,
      currency,
      personName,
      status,
      debtDate,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
      paidAt,
      updatedBy: 'agent',
    },
    reason,
    filePath: `debts/${id}.md`,
  };
}

Deno.test('DebtSlackFormatter formats single debt document', () => {
  const formatter = new DebtSlackFormatter();
  const result = formatter.formatDebtDocument(makeDebt(), false);
  assert(result.includes('John Doe'), 'Should include person name');
  assert(result.includes('100'), 'Should include amount');
  assert(result.includes('$'), 'Should include currency symbol');
  assert(result.includes('Pending'), 'Should include status');
  assert(result.includes('Lunch money'), 'Should include reason');
});

Deno.test('DebtSlackFormatter formats debt with ID when requested', () => {
  const formatter = new DebtSlackFormatter();
  const debt = makeDebt({ id: 'abc123-def456-ghi789' });
  const result = formatter.formatDebtDocument(debt, true);
  assert(result.includes('#abc123-'), 'Should include truncated ID');
});

Deno.test('DebtSlackFormatter formats lent direction correctly', () => {
  const formatter = new DebtSlackFormatter();
  const result = formatter.formatDebtDocument(
    makeDebt({ direction: DebtDirection.LENT, amount: 75 }),
    false,
  );
  assert(result.includes(':moneybag: Lent to'), 'Should show lent emoji and text');
});

Deno.test('DebtSlackFormatter formats borrowed direction correctly', () => {
  const formatter = new DebtSlackFormatter();
  const result = formatter.formatDebtDocument(
    makeDebt({ direction: DebtDirection.BORROWED, amount: 30 }),
    false,
  );
  assert(result.includes(':inbox_tray: Borrowed from'), 'Should show borrowed emoji and text');
});

Deno.test('DebtSlackFormatter formats paid status', () => {
  const formatter = new DebtSlackFormatter();
  const result = formatter.formatDebtDocument(
    makeDebt({ status: DebtStatus.PAID, paidAt: '2024-01-20T10:00:00Z' }),
    false,
  );
  assert(result.includes(':white_check_mark: Paid'), 'Should show paid status');
  assert(result.includes('Paid on'), 'Should include paid date label');
});

Deno.test('DebtSlackFormatter formats cancelled status', () => {
  const formatter = new DebtSlackFormatter();
  const result = formatter.formatDebtDocument(makeDebt({ status: DebtStatus.CANCELLED }), false);
  assert(result.includes(':x: Cancelled'), 'Should show cancelled status');
});

Deno.test('DebtSlackFormatter formats debt list with multiple debts', () => {
  const formatter = new DebtSlackFormatter();
  const debts: DebtDocument[] = [
    makeDebt({ id: 'debt-1', personName: 'John' }),
    makeDebt({ id: 'debt-2', personName: 'Jane', direction: DebtDirection.BORROWED }),
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
  assert(result.includes('200'), 'Should include total lent');
  assert(result.includes('100'), 'Should include total borrowed');
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
  assert(result.includes('100'), 'Should show net amount');
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
    const result = formatter.formatCurrency(100, code);
    assert(result.includes(symbol), `Should include ${symbol} for ${code}`);
  }
});
