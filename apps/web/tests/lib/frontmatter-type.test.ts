import { assert, assertFalse } from '@std/assert';
import { isDebtFrontmatter } from '../../src/lib/markdown-parser.ts';

Deno.test('isDebtFrontmatter does not misclassify a daily note as a debt', () => {
  // A daily note carries a `status` field ('draft' | 'completed'). That field
  // must never trigger debt detection, or the DEBT PROPERTIES inspector shows
  // on every daily note.
  const dailyFrontmatter = {
    id: 'daily_2026-08-21',
    date: '2026-08-21',
    status: 'completed',
    updatedAt: '2026-08-21T00:00:00.000Z',
    updatedBy: 'agent',
  };
  assertFalse(isDebtFrontmatter(dailyFrontmatter));
});

Deno.test('isDebtFrontmatter detects a complete debt by its unique fields', () => {
  const debtFrontmatter = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    direction: 'lent',
    amount: 100,
    currency: 'USD',
    personName: 'Alice',
    status: 'pending',
    debtDate: '2026-08-21',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
  };
  assert(isDebtFrontmatter(debtFrontmatter));
});

Deno.test('isDebtFrontmatter detects a debt that only has person and amount set', () => {
  // A debt being entered mid-edit may carry personName/amount but not the rest.
  assert(isDebtFrontmatter({ personName: 'Bob' }));
  assert(isDebtFrontmatter({ amount: 0 }));
});

Deno.test('isDebtFrontmatter returns false for a plain markdown note', () => {
  assertFalse(isDebtFrontmatter({ title: 'Some note' }));
  assertFalse(isDebtFrontmatter({}));
});
