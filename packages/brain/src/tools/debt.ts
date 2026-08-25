import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import { formatDebtSummary } from '@work-boost/data-provider';
import type { DebtRepository } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import { successResult } from './result.ts';

const debtParams = Type.Object({
  action: StringEnum(['list', 'settle', 'summary', 'delete'], {
    description: 'Action to perform on a debt',
  }),
  // list
  personName: Type.Optional(
    Type.String({ description: 'Name of the person involved in this debt' }),
  ),
  status: Type.Optional(
    StringEnum(['pending', 'paid', 'cancelled'], { description: 'Filter by status' }),
  ),
  direction: Type.Optional(
    StringEnum(['lent', 'borrowed'], { description: 'Filter by direction' }),
  ),
  // settle / delete
  debtId: Type.Optional(Type.String({ description: 'ID of the debt' })),
});

/**
 * Generic debt tool with an action discriminator.
 *
 * Creation is handled by the `create_document` tool (type=debt); this tool
 * covers the read/write operations that carry debt-specific invariants:
 * settling flips status and moves the file to the archive, deleting requires an
 * existing debt id, and listing/Summary aggregate across the workspace.
 */
export function createDebtTool(debts: DebtRepository): AgentTool<typeof debtParams> {
  return {
    name: 'debt',
    label: 'Debt',
    description:
      'Manage debts: list, settle, summarize, and delete. Use when the user repays a debt or asks about debt amounts. To create a new debt, use create_document with type=debt.',
    parameters: debtParams,
    execute: async (_toolCallId, params) => {
      switch (params.action) {
        case 'list':
          return listDebts(debts, params);
        case 'settle':
          return settleDebt(debts, params);
        case 'summary':
          return debtSummary(debts);
        case 'delete':
          return deleteDebt(debts, params);
        default:
          throw new Error(`Unknown debt action: ${params.action}`);
      }
    },
  };
}

async function listDebts(
  debts: DebtRepository,
  params: { personName?: string; status?: string; direction?: string },
): Promise<AgentToolResult<unknown>> {
  const { personName, status, direction } = params;
  const documents = await debts.filter({
    status: status as DebtStatus | undefined,
    direction: direction as DebtDirection | undefined,
    personName,
  });

  if (documents.length === 0) {
    return successResult([], '📭 No debts.');
  }

  const summary = documents.map((document) => formatDebtSummary(document)).join('\n\n');
  return successResult(documents, summary);
}

async function settleDebt(
  debts: DebtRepository,
  params: { debtId?: string },
): Promise<AgentToolResult<unknown>> {
  const { debtId } = params;
  if (!debtId) throw new Error('Missing debtId to settle the debt.');
  const document = await debts.getById(debtId);

  if (!document) {
    throw new Error(`Debt ${debtId} not found`);
  }

  if (document.frontmatter.status === DebtStatus.PAID) {
    return successResult(null, `✅ Debt ${debtId.slice(0, 8)} is already settled.`);
  }

  const settled = await debts.settle(debtId);
  if (!settled) {
    throw new Error(`Failed to settle debt ${debtId}`);
  }

  return successResult(
    settled,
    `✅ Marked debt ${debtId.slice(0, 8)} as paid.\n📄 File: ${settled.filePath}`,
  );
}

async function debtSummary(debts: DebtRepository): Promise<AgentToolResult<unknown>> {
  const summary = await debts.getSummary();

  const currencyKeys = Object.keys(summary.currencies);
  const defaultCurrency = currencyKeys.length === 1 ? currencyKeys[0] : 'VND';
  function formatAmount(amount: number): string {
    return `${amount.toLocaleString('en-US')} ${defaultCurrency}`;
  }

  const parts: string[] = [];
  if (summary.totalLent > 0) {
    parts.push(
      `💰 Owed to you: ${formatAmount(summary.totalLent)} (${summary.pendingLentCount} pending)`,
    );
  }
  if (summary.totalBorrowed > 0) {
    parts.push(
      `📥 You owe: ${formatAmount(summary.totalBorrowed)} (${summary.pendingBorrowedCount} pending)`,
    );
  }

  const net = summary.netPosition;
  let netText: string;
  if (net > 0) {
    netText = `🟢 You are owed: ${formatAmount(net)}`;
  } else if (net < 0) {
    netText = `🔴 You need to pay: ${formatAmount(Math.abs(net))}`;
  } else {
    netText = '⚪ Everything is balanced';
  }
  parts.push(netText);

  const summaryText =
    Object.entries(summary.currencies).length > 1
      ? parts.join('\n') + '\n\n💱 Multi-currency amounts are calculated separately.'
      : parts.join('\n');

  return successResult(summary, summaryText);
}

async function deleteDebt(
  debts: DebtRepository,
  params: { debtId?: string },
): Promise<AgentToolResult<unknown>> {
  const { debtId } = params;
  if (!debtId) throw new Error('Missing debtId to delete the debt.');

  const existing = await debts.getById(debtId);
  if (!existing) {
    throw new Error(`Debt ${debtId} not found`);
  }

  await debts.delete(debtId);
  return successResult({ debtId }, `🗑 Deleted debt ${debtId.slice(0, 8)}.`);
}
