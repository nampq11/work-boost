/**
 * Tests for Telegram debt formatter
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { DebtTelegramFormatter } from '@work-boost/extensions';
import { formatCurrency } from '@work-boost/extensions/formatters/debt-formatting.ts';
import {
  debtConfirmKeyboard,
  debtDirectionKeyboard,
  debtItemKeyboard,
  debtListKeyboard,
  debtMenuKeyboard,
  debtReminderKeyboard,
} from '@work-boost/extensions/telegram/keyboards.ts';

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

Deno.test('DebtTelegramFormatter formats single debt document', () => {
  const formatter = new DebtTelegramFormatter();
  const result = formatter.formatDebtDocument(makeDebt(), false);
  assert(result.includes('John Doe'), 'Should include person name');
  assert(result.includes('100'), 'Should include amount');
  assert(result.includes('$'), 'Should include currency symbol');
  assert(result.includes('Pending'), 'Should include status');
  assert(result.includes('Lunch money'), 'Should include reason');
});

Deno.test('DebtTelegramFormatter formats debt with ID when requested', () => {
  const formatter = new DebtTelegramFormatter();
  const debt = makeDebt({ id: 'abc123-def456-ghi789' });
  const result = formatter.formatDebtDocument(debt, true);
  assert(result.includes('#abc123-'), 'Should include truncated ID');
});

Deno.test('DebtTelegramFormatter formats lent direction correctly', () => {
  const formatter = new DebtTelegramFormatter();
  const result = formatter.formatDebtDocument(
    makeDebt({ direction: DebtDirection.LENT, amount: 75 }),
    false,
  );
  assert(result.includes('💰 Lent to'), 'Should show lent emoji and text');
});

Deno.test('DebtTelegramFormatter formats borrowed direction correctly', () => {
  const formatter = new DebtTelegramFormatter();
  const result = formatter.formatDebtDocument(
    makeDebt({ direction: DebtDirection.BORROWED, amount: 30 }),
    false,
  );
  assert(result.includes('📥 Borrowed from'), 'Should show borrowed emoji and text');
});

Deno.test('DebtTelegramFormatter formats paid status', () => {
  const formatter = new DebtTelegramFormatter();
  const result = formatter.formatDebtDocument(
    makeDebt({ status: DebtStatus.PAID, paidAt: '2024-01-20T10:00:00Z' }),
    false,
  );
  assert(result.includes('✅ Paid'), 'Should show paid status');
  assert(result.includes('Paid on'), 'Should include paid date label');
});

Deno.test('DebtTelegramFormatter formats cancelled status', () => {
  const formatter = new DebtTelegramFormatter();
  const result = formatter.formatDebtDocument(makeDebt({ status: DebtStatus.CANCELLED }), false);
  assert(result.includes('❌ Cancelled'), 'Should show cancelled status');
});

Deno.test('DebtTelegramFormatter formats debt list with multiple debts', () => {
  const formatter = new DebtTelegramFormatter();
  const debts: DebtDocument[] = [
    makeDebt({ id: 'debt-1', personName: 'John' }),
    makeDebt({ id: 'debt-2', personName: 'Jane', direction: DebtDirection.BORROWED }),
  ];
  const result = formatter.formatDebtList(debts, '📋 All Debts');
  assertEquals(result.length, 1, 'Should return single message for short list');
  assert(result[0].includes('📋 All Debts'), 'Should include title');
  assert(result[0].includes('John'), 'Should include first debt');
  assert(result[0].includes('Jane'), 'Should include second debt');
});

Deno.test('DebtTelegramFormatter formats empty debt list', () => {
  const formatter = new DebtTelegramFormatter();
  const result = formatter.formatDebtList([], 'My Debts');
  assertEquals(result.length, 1);
  assert(result[0].includes('My Debts'));
});

Deno.test('DebtTelegramFormatter formats debt summary', () => {
  const formatter = new DebtTelegramFormatter();
  const summary = {
    totalLent: 200,
    totalBorrowed: 100,
    totalLentPaid: 50,
    totalBorrowedPaid: 25,
    pendingLentCount: 3,
    pendingBorrowedCount: 2,
    netPosition: 100,
  };
  const result = formatter.formatDebtSummary(summary);
  assert(result.includes('💵 Debt Summary'), 'Should include title');
  assert(result.includes('200'), 'Should include total lent');
  assert(result.includes('100'), 'Should include total borrowed');
  assert(result.includes('(3 pending)'), 'Should include pending lent count');
  assert(result.includes('(2 pending)'), 'Should include pending borrowed count');
});

Deno.test('DebtTelegramFormatter shows positive net position', () => {
  const formatter = new DebtTelegramFormatter();
  const summary = {
    totalLent: 200,
    totalBorrowed: 100,
    totalLentPaid: 0,
    totalBorrowedPaid: 0,
    pendingLentCount: 2,
    pendingBorrowedCount: 1,
    netPosition: 100,
  };
  const result = formatter.formatDebtSummary(summary);
  assert(result.includes('🟢'), 'Should show green emoji for positive');
  assert(result.includes("You're owed"), 'Should say owed to user');
  assert(result.includes('100'), 'Should show net amount');
});

Deno.test('DebtTelegramFormatter shows negative net position', () => {
  const formatter = new DebtTelegramFormatter();
  const summary = {
    totalLent: 50,
    totalBorrowed: 200,
    totalLentPaid: 0,
    totalBorrowedPaid: 0,
    pendingLentCount: 1,
    pendingBorrowedCount: 3,
    netPosition: -150,
  };
  const result = formatter.formatDebtSummary(summary);
  assert(result.includes('🔴'), 'Should show red emoji for negative');
  assert(result.includes('You owe'), 'Should say user owes');
});

Deno.test('DebtTelegramFormatter shows settled up when net is zero', () => {
  const formatter = new DebtTelegramFormatter();
  const summary = {
    totalLent: 0,
    totalBorrowed: 0,
    totalLentPaid: 100,
    totalBorrowedPaid: 100,
    pendingLentCount: 0,
    pendingBorrowedCount: 0,
    netPosition: 0,
  };
  const result = formatter.formatDebtSummary(summary);
  assert(result.includes('⚪'), 'Should show white emoji for zero');
  assert(result.includes('All settled up'), 'Should say settled');
});

Deno.test('Telegram keyboards creates debt menu keyboard', () => {
  const keyboard = debtMenuKeyboard();
  assertExists(keyboard);
  assertEquals(typeof keyboard.inline_keyboard, 'object');
});

Deno.test('Telegram keyboards creates direction selection keyboard', () => {
  const keyboard = debtDirectionKeyboard();
  assertExists(keyboard);
  assertEquals(typeof keyboard.inline_keyboard, 'object');
});

Deno.test('Telegram keyboards creates list filter keyboard', () => {
  const keyboard = debtListKeyboard();
  assertExists(keyboard);
  assertEquals(typeof keyboard.inline_keyboard, 'object');
});

Deno.test('Telegram keyboards creates debt item keyboard with pending status', () => {
  const keyboard = debtItemKeyboard('debt-123', DebtStatus.PENDING);
  assertExists(keyboard);
  assertEquals(typeof keyboard.inline_keyboard, 'object');
});

Deno.test('Telegram keyboards creates paid debt item keyboard', () => {
  const keyboard = debtItemKeyboard('debt-123', DebtStatus.PAID);
  assertExists(keyboard);
  assertEquals(typeof keyboard.inline_keyboard, 'object');
});

Deno.test('Telegram keyboards creates confirmation keyboard', () => {
  const keyboard = debtConfirmKeyboard('delete', 'debt-123');
  assertExists(keyboard);
  assertEquals(typeof keyboard.inline_keyboard, 'object');
});

Deno.test('Telegram keyboards creates reminder keyboard', () => {
  const keyboard = debtReminderKeyboard('weekly');
  assertExists(keyboard);
  assertEquals(typeof keyboard.inline_keyboard, 'object');
});

Deno.test('DebtTelegramFormatter handles different currencies', () => {
  const currencies = [
    { code: 'USD', symbol: '$' },
    { code: 'EUR', symbol: '€' },
    { code: 'GBP', symbol: '£' },
    { code: 'JPY', symbol: '¥' },
    { code: 'VND', symbol: '₫' },
  ];
  for (const { code, symbol } of currencies) {
    const result = formatCurrency(100, code);
    assert(result.includes(symbol), `Should include ${symbol} for ${code}`);
  }
});

Deno.test('DebtTelegramFormatter escapes HTML in person name', () => {
  const formatter = new DebtTelegramFormatter();
  const debt = makeDebt({ personName: 'John & <Jane> "Doe"' });
  const result = formatter.formatDebtDocument(debt, false);
  assert(result.includes('&amp;'), 'Should escape ampersand');
  assert(result.includes('&lt;'), 'Should escape less than');
  assert(result.includes('&gt;'), 'Should escape greater than');
});
