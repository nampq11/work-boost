import React from 'react';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

export function FrontmatterInspector() {
  const document = useWorkspaceStore((state) => state.activeDocument);
  const update = useWorkspaceStore((state) => state.updateFrontmatter);
  if (!document) return null;
  const frontmatter = document.frontmatter;
  const set = (key: string, value: unknown) => update({ ...frontmatter, [key]: value });
  const isDebt = Boolean(frontmatter.personName || frontmatter.amount || frontmatter.status);
  if (!isDebt) return <div className="inspector muted">No structured properties</div>;
  return (
    <section className="inspector">
      <div className="section-label">Debt properties</div>
      <div className="inspector-grid">
        <label>
          Person
          <input
            value={String(frontmatter.personName ?? '')}
            onChange={(event) => set('personName', event.target.value)}
          />
        </label>
        <label>
          Amount
          <input
            type="number"
            value={Number(frontmatter.amount ?? 0)}
            onChange={(event) => {
              if (event.target.validity.badInput) return;
              const amount = event.target.valueAsNumber;
              if (Number.isFinite(amount) && amount > 0) set('amount', amount);
            }}
          />
        </label>
        <label>
          Currency
          <input
            value={String(frontmatter.currency ?? '')}
            onChange={(event) => set('currency', event.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={String(frontmatter.status ?? 'pending')}
            onChange={(event) => set('status', event.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Direction
          <select
            value={String(frontmatter.direction ?? 'lent')}
            onChange={(event) => set('direction', event.target.value)}
          >
            <option value="lent">Lent</option>
            <option value="borrowed">Borrowed</option>
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={String(frontmatter.debtDate ?? '')}
            onChange={(event) => set('debtDate', event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
