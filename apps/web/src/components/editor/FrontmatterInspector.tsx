import {
  ArrowsLeftRight,
  CalendarBlank,
  CheckCircle,
  Coins,
  CurrencyDollar,
  User,
} from '@phosphor-icons/react';
import React from 'react';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function FrontmatterInspector() {
  const document = useWorkspaceStore((state) => state.activeDocument);
  const update = useWorkspaceStore((state) => state.updateFrontmatter);

  if (!document) return null;
  const frontmatter = document.frontmatter;
  const set = (key: string, value: unknown) => update({ ...frontmatter, [key]: value });
  const isDebt = Boolean(frontmatter.personName || frontmatter.amount || frontmatter.status);

  if (!isDebt) return null;

  return (
    <div className="mb-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--surface-sidebar)] text-sm">
      <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-4">
        <Coins size={15} className="text-[var(--accent-green)]" />
        <span>Debt Properties</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Person */}
        <label className="flex flex-col gap-1.5 text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5 text-sm">
            <User size={13} /> Person
          </span>
          <input
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] text-sm"
            value={String(frontmatter.personName ?? '')}
            onChange={(event) => set('personName', event.target.value)}
          />
        </label>

        {/* Amount */}
        <label className="flex flex-col gap-1.5 text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5 text-sm">
            <CurrencyDollar size={13} /> Amount
          </span>
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
        </label>

        {/* Currency */}
        <label className="flex flex-col gap-1.5 text-[var(--text-secondary)]">
          <span className="text-sm">Currency</span>
          <input
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] uppercase font-semibold text-xs"
            value={String(frontmatter.currency ?? 'VND')}
            onChange={(event) => set('currency', event.target.value)}
          />
        </label>

        {/* Status */}
        <label className="flex flex-col gap-1.5 text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5 text-sm">
            <CheckCircle size={13} /> Status
          </span>
          <select
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] cursor-pointer text-sm"
            value={String(frontmatter.status ?? 'pending')}
            onChange={(event) => set('status', event.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        {/* Direction */}
        <label className="flex flex-col gap-1.5 text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5 text-sm">
            <ArrowsLeftRight size={13} /> Direction
          </span>
          <select
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] cursor-pointer text-sm"
            value={String(frontmatter.direction ?? 'lent')}
            onChange={(event) => set('direction', event.target.value)}
          >
            <option value="lent">Lent (Cho vay)</option>
            <option value="borrowed">Borrowed (Đi vay)</option>
          </select>
        </label>

        {/* Date */}
        <label className="flex flex-col gap-1.5 text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5 text-sm">
            <CalendarBlank size={13} /> Date
          </span>
          <input
            type="date"
            className="h-8 px-2.5 rounded bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] text-sm"
            value={String(frontmatter.debtDate ?? '')}
            onChange={(event) => set('debtDate', event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
