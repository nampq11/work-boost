import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import { formatDebtSummary } from '@work-boost/data-provider';
import type { DebtRepository } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
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
  // settle / delete resolution
  // Settle and delete resolve their target by debtId when given, otherwise by
  // personName (optionally narrowed by amount/direction). Declaring intent once
  // instead of listing first keeps the agent from running a read-then-act dance.
  amount: Type.Optional(
    Type.Number({ description: 'Amount to disambiguate a person who has several debts' }),
  ),
  debtId: Type.Optional(
    Type.String({ description: 'ID of the debt (exact; otherwise resolved by personName)' }),
  ),
});

/**
 * Generic debt tool with an action discriminator.
 *
 * Creation is handled by the `create_document` tool (type=debt); this tool
 * covers the read/write operations that carry debt-specific invariants:
 * settling flips status and moves the file to the archive, deleting removes a
 * resolved debt, and listing/summary aggregate across the workspace. Settle and
 * delete resolve their target by debtId or by personName (with amount/direction
 * to disambiguate), so the agent declares intent once instead of listing first.
 */
export function createDebtTool(debts: DebtRepository): AgentTool<typeof debtParams> {
  return {
    name: 'debt',
    label: 'Debt',
    description:
      'Manage debts: list, settle, summarize, and delete. Settle and delete resolve the target by debtId when given, otherwise by personName (add amount or direction to disambiguate). To create a new debt, use create_document with type=debt.',
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

/**
 * Resolve the single debt a settle/delete action targets.
 *
 * debtId wins outright; otherwise the caller's intent (personName, optionally
 * narrowed by amount/direction) identifies the target. Throws on ambiguity so
 * the agent can ask the user one short clarifying question, matching the
 * "ask about ambiguity" product rule instead of silently acting on the wrong
 * debt.
 */
async function resolveDebtTarget(
  debts: DebtRepository,
  params: {
    debtId?: string;
    personName?: string;
    amount?: number;
    direction?: string;
    status?: DebtStatus;
  },
): Promise<DebtDocument> {
  if (params.debtId) {
    const document = await debts.getById(params.debtId);
    if (!document) throw new Error(`Debt ${params.debtId} not found`);
    return document;
  }
  if (!params.personName) {
    throw new Error('Provide debtId or personName to identify the debt.');
  }

  const matches = await debts.filter({
    personName: params.personName,
    status: params.status,
    direction: params.direction as DebtDirection | undefined,
  });
  const precise =
    params.amount === undefined
      ? matches
      : matches.filter((document) => document.frontmatter.amount === params.amount);

  if (precise.length === 0) {
    const statusText = params.status === undefined ? '' : `${params.status} `;
    throw new Error(`No ${statusText}debt found for ${params.personName}.`);
  }
  if (precise.length === 1) return precise[0];
  throw new Error(
    `Multiple debts found for ${params.personName} - specify the amount or the debtId.`,
  );
}

async function settleDebt(
  debts: DebtRepository,
  params: { debtId?: string; personName?: string; amount?: number; direction?: string },
): Promise<AgentToolResult<unknown>> {
  const document = await resolveDebtTarget(debts, { ...params, status: DebtStatus.PENDING });
  const shortId = document.frontmatter.id.slice(0, 8);

  if (document.frontmatter.status === DebtStatus.PAID) {
    return successResult(null, `✅ Debt ${shortId} is already settled.`);
  }

  const settled = await debts.settle(document.frontmatter.id);
  if (!settled) {
    throw new Error(`Failed to settle debt ${shortId}`);
  }

  return successResult(settled, `✅ Marked debt ${shortId} as paid.\n📄 File: ${settled.filePath}`);
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
  params: { debtId?: string; personName?: string; amount?: number; direction?: string },
): Promise<AgentToolResult<unknown>> {
  const document = await resolveDebtTarget(debts, params);
  const shortId = document.frontmatter.id.slice(0, 8);
  const deleted = await debts.delete(document.frontmatter.id);
  if (!deleted) {
    throw new Error(`Failed to delete debt ${shortId}`);
  }
  return successResult({ debtId: document.frontmatter.id }, `🗑 Deleted debt ${shortId}.`);
}
