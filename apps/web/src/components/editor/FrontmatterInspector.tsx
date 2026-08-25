import {
  ArrowsLeftRight,
  CalendarBlank,
  CheckCircle,
  Coins,
  CurrencyDollar,
  User,
} from '@phosphor-icons/react';
import React from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { isDebtFrontmatter } from '../../lib/markdown-parser.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function FrontmatterInspector() {
  const { t } = useI18n();
  const document = useWorkspaceStore((state) => state.activeDocument);
  const update = useWorkspaceStore((state) => state.updateFrontmatter);

  const frontmatter = document?.frontmatter;
  if (!frontmatter || !isDebtFrontmatter(frontmatter)) return null;
  const set = (key: string, value: unknown) => update({ ...frontmatter, [key]: value });

  return (
    <div className="mb-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--surface-sidebar)] text-sm">
      <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-4">
        <Coins size={15} className="text-[var(--accent-green)]" />
        <span>{t('frontmatter.debtProperties')}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Person */}
        <DebtField label={t('frontmatter.person')} icon={<User size={13} />}>
          <input
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] text-sm"
            value={String(frontmatter.personName ?? '')}
            onChange={(event) => set('personName', event.target.value)}
          />
        </DebtField>

        {/* Amount */}
        <DebtField label={t('frontmatter.amount')} icon={<CurrencyDollar size={13} />}>
          <input
            type="number"
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] font-mono outline-none focus:border-[var(--accent-blue)] text-sm"
            value={Number(frontmatter.amount ?? 0)}
            onChange={(event) => {
              if (event.target.validity.badInput) return;
              const amount = event.target.valueAsNumber;
              if (Number.isFinite(amount) && amount > 0) set('amount', amount);
            }}
          />
        </DebtField>

        {/* Currency */}
        <DebtField label={t('frontmatter.currency')}>
          <input
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] uppercase font-semibold text-xs"
            value={String(frontmatter.currency ?? 'VND')}
            onChange={(event) => set('currency', event.target.value)}
          />
        </DebtField>

        {/* Status */}
        <DebtField label={t('frontmatter.status')} icon={<CheckCircle size={13} />}>
          <select
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] cursor-pointer text-sm"
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
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] cursor-pointer text-sm"
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
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] text-sm"
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
    <label className="flex flex-col gap-1.5 text-[var(--text-secondary)]">
      <span className="flex items-center gap-1.5 text-sm">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
