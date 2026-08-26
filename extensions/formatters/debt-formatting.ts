export interface DebtCurrencyTotals {
  lent: number;
  borrowed: number;
  lentPaid: number;
  borrowedPaid: number;
}

export type DebtCurrencies = Record<string, DebtCurrencyTotals>;

export function formatDate(dateString: string): string {
  const dateParts = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(dateString);

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface DebtSummaryInput {
  totalLent: number;
  totalBorrowed: number;
  totalLentPaid: number;
  totalBorrowedPaid: number;
  currencies?: DebtCurrencies;
}

export interface DebtNetPosition {
  currency: string;
  value: number;
}

export interface DebtNetSummary {
  positions: DebtNetPosition[];
  text: string;
  hasPositivePosition: boolean;
  hasNegativePosition: boolean;
}

export function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    VND: '₫',
  };
  const symbol = symbols[currency] || currency + ' ';
  // Match the grouping locale to the currency symbol ($1,000 not $1.000).
  const locales: Record<string, string> = {
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
    JPY: 'ja-JP',
    VND: 'vi-VN',
  };
  return `${symbol}${amount.toLocaleString(locales[currency] || 'en-US')}`;
}

export function resolveDebtCurrencies(summary: DebtSummaryInput): DebtCurrencies {
  return (
    summary.currencies || {
      USD: {
        lent: summary.totalLent,
        borrowed: summary.totalBorrowed,
        lentPaid: summary.totalLentPaid,
        borrowedPaid: summary.totalBorrowedPaid,
      },
    }
  );
}

export function calculateNetSummary(currencies: DebtCurrencies): DebtNetSummary {
  const positions = Object.entries(currencies).map(([currency, totals]) => ({
    currency,
    value: totals.lent - totals.borrowed,
  }));
  const positionText = positions
    .map(({ currency, value }) => {
      if (value > 0) {
        return `You're owed ${formatCurrency(value, currency)}`;
      }
      if (value < 0) {
        return `You owe ${formatCurrency(Math.abs(value), currency)}`;
      }
      return null;
    })
    .filter((text): text is string => text !== null)
    .join(', ');

  return {
    positions,
    text: positionText || 'All settled up!',
    hasPositivePosition: positions.some(({ value }) => value > 0),
    hasNegativePosition: positions.some(({ value }) => value < 0),
  };
}

export function resolveNetEmoji(
  hasPositivePosition: boolean,
  hasNegativePosition: boolean,
  format: 'slack' | 'telegram',
): string {
  if (hasPositivePosition && !hasNegativePosition) {
    return format === 'slack' ? ':large_green_circle:' : '🟢';
  }
  if (hasNegativePosition && !hasPositivePosition) {
    return format === 'slack' ? ':red_circle:' : '🔴';
  }
  return format === 'slack' ? ':white_circle:' : '⚪';
}
