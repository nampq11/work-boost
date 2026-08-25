import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowsLeftRight,
  CalendarBlank,
  CheckCircle,
  Clock,
  Coins,
  CurrencyDollar,
  User,
  XCircle,
} from '@phosphor-icons/react';
import React, { useState } from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { isDebtFrontmatter } from '../../lib/markdown-parser.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

// Shared input styling so every field in the inspector looks identical.
const FIELD_CLASSES =
  'h-9 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-app)] px-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)]';
const SELECT_CLASSES = `${FIELD_CLASSES} cursor-pointer`;

// Common currencies offered as suggestions; any value is still accepted so
// existing notes that use an uncommon code keep editing cleanly.
const CURRENCY_SUGGESTIONS = ['VND', 'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'KRW'];

export function FrontmatterInspector() {
  const { t } = useI18n();
  const document = useWorkspaceStore((state) => state.activeDocument);
  const update = useWorkspaceStore((state) => state.updateFrontmatter);

  const frontmatter = document?.frontmatter;
  if (!frontmatter || !isDebtFrontmatter(frontmatter)) return null;
  const set = (key: string, value: unknown) => update({ ...frontmatter, [key]: value });

  return (
    <div className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--surface-sidebar)] p-4 text-sm">
      <div className="mb-4 flex items-center gap-2">
        <Coins size={15} className="shrink-0 text-[var(--accent-green)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {t('frontmatter.debtProperties')}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <DirectionBadge direction={frontmatter.direction} />
          <StatusBadge status={frontmatter.status} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {/* Person */}
        <DebtField label={t('frontmatter.person')} icon={<User size={13} />}>
          <input
            className={FIELD_CLASSES}
            value={String(frontmatter.personName ?? '')}
            onChange={(event) => set('personName', event.target.value)}
          />
        </DebtField>

        {/* Amount */}
        <DebtField label={t('frontmatter.amount')} icon={<CurrencyDollar size={13} />}>
          <AmountInput
            value={Number(frontmatter.amount ?? 0)}
            onCommit={(amount) => set('amount', amount)}
          />
        </DebtField>

        {/* Currency */}
        <DebtField label={t('frontmatter.currency')}>
          <input
            className={`${FIELD_CLASSES} text-xs font-semibold uppercase`}
            list="debt-currency-suggestions"
            value={String(frontmatter.currency ?? 'VND')}
            onChange={(event) => set('currency', event.target.value.toUpperCase())}
          />
          <datalist id="debt-currency-suggestions">
            {CURRENCY_SUGGESTIONS.map((currency) => (
              <option key={currency} value={currency} />
            ))}
          </datalist>
        </DebtField>

        {/* Status */}
        <DebtField label={t('frontmatter.status')} icon={<CheckCircle size={13} />}>
          <select
            className={SELECT_CLASSES}
            value={String(frontmatter.status ?? 'pending')}
            onChange={(event) => set('status', event.target.value)}
          >
            <option value="pending">{t('frontmatter.statusPending')}</option>
            <option value="paid">{t('frontmatter.statusPaid')}</option>
            <option value="cancelled">{t('frontmatter.statusCancelled')}</option>
          </select>
        </DebtField>

        {/* Direction */}
        <DebtField label={t('frontmatter.direction')} icon={<ArrowsLeftRight size={13} />}>
          <select
            className={SELECT_CLASSES}
            value={String(frontmatter.direction ?? 'lent')}
            onChange={(event) => set('direction', event.target.value)}
          >
            <option value="lent">{t('frontmatter.directionLent')}</option>
            <option value="borrowed">{t('frontmatter.directionBorrowed')}</option>
          </select>
        </DebtField>

        {/* Date */}
        <DebtField label={t('frontmatter.date')} icon={<CalendarBlank size={13} />}>
          <input
            type="date"
            className={FIELD_CLASSES}
            value={String(frontmatter.debtDate ?? '')}
            onChange={(event) => set('debtDate', event.target.value)}
          />
        </DebtField>
      </div>
    </div>
  );
}

function DebtField({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[var(--text-secondary)]">
      <span className="flex items-center gap-1.5 text-sm">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

// Editable amount that shows a grouped figure (e.g. "300,000") when idle and a
// raw digit string while typing, so the caret never jumps. Committing a value
// keeps it a positive number.
function AmountInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (amount: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState('');

  function commit(raw: string): void {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return;
    const amount = Number(digits);
    if (Number.isFinite(amount) && amount > 0) onCommit(amount);
  }

  const display = focused ? editing : value > 0 ? value.toLocaleString('en-US') : '';

  return (
    <input
      type="text"
      inputMode="numeric"
      className={`${FIELD_CLASSES} tabular-nums`}
      value={display}
      onFocus={() => {
        setFocused(true);
        setEditing(value > 0 ? String(value) : '');
      }}
      onBlur={(event) => {
        setFocused(false);
        commit(event.target.value);
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 15);
        setEditing(digits);
        commit(digits);
      }}
    />
  );
}

function StatusBadge({ status }: { status: unknown }) {
  const { t } = useI18n();
  const value = String(status ?? 'pending');
  const config = {
    paid: {
      label: t('frontmatter.statusPaid'),
      color: 'var(--accent-green)',
      icon: <CheckCircle size={11} weight="bold" />,
    },
    pending: {
      label: t('frontmatter.statusPending'),
      color: 'var(--accent-blue)',
      icon: <Clock size={11} weight="bold" />,
    },
    cancelled: {
      label: t('frontmatter.statusCancelled'),
      color: 'var(--text-secondary)',
      icon: <XCircle size={11} weight="bold" />,
    },
  } as const;
  const current = config[value as keyof typeof config] ?? config.pending;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: current.color,
        backgroundColor: `color-mix(in srgb, ${current.color} 12%, transparent)`,
      }}
    >
      {current.icon}
      {current.label}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: unknown }) {
  const { t } = useI18n();
  const isLent = String(direction ?? 'lent') === 'lent';
  const color = isLent ? 'var(--accent-green)' : 'var(--accent-orange)';
  const Icon = isLent ? ArrowUpRight : ArrowDownLeft;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <Icon size={11} weight="bold" />
      {isLent ? t('frontmatter.directionLent') : t('frontmatter.directionBorrowed')}
    </span>
  );
}
