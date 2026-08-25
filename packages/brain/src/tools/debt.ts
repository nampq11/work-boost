import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import { formatDebtSummary } from '@work-boost/data-provider';
import type { DebtRepository } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import { successResult } from './result.ts';

const debtParams = Type.Object({
  action: StringEnum(['list', 'settle', 'summary', 'delete'], {
    description: 'Hành động cần thực hiện trên khoản nợ',
  }),
  // list
  personName: Type.Optional(Type.String({ description: 'Tên người involved trong khoản này' })),
  status: Type.Optional(
    StringEnum(['pending', 'paid', 'cancelled'], { description: 'Lọc theo trạng thái' }),
  ),
  direction: Type.Optional(
    StringEnum(['lent', 'borrowed'], { description: 'Lọc theo hướng tiền' }),
  ),
  // settle / delete
  debtId: Type.Optional(Type.String({ description: 'ID của khoản nợ' })),
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
      'Quản lý khoản nợ: liệt kê, thanh toán, tổng kết và xóa. Dùng khi người dùng trả nợ, hoặc hỏi về số nợ. Muốn tạo khoản nợ mới, dùng create_document với type=debt.',
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
  const docs = await debts.filter({
    status: status as DebtStatus | undefined,
    direction: direction as DebtDirection | undefined,
    personName,
  });

  if (docs.length === 0) {
    return successResult([], '📭 Không có khoản nợ nào.');
  }

  const summary = docs.map((doc) => formatDebtSummary(doc)).join('\n\n');
  return successResult(docs, summary);
}

async function settleDebt(
  debts: DebtRepository,
  params: { debtId?: string },
): Promise<AgentToolResult<unknown>> {
  const { debtId } = params;
  if (!debtId) throw new Error('Thiếu debtId để thanh toán khoản nợ.');
  const doc = await debts.getById(debtId);

  if (!doc) {
    throw new Error(`Debt ${debtId} not found`);
  }

  if (doc.frontmatter.status === DebtStatus.PAID) {
    return successResult(null, `✅ Khoản nợ ${debtId.slice(0, 8)} đã được thanh toán rồi.`);
  }

  const settled = await debts.settle(debtId);
  if (!settled) {
    throw new Error(`Failed to settle debt ${debtId}`);
  }

  return successResult(
    settled,
    `✅ Đã đánh dấu khoản nợ ${debtId.slice(0, 8)} là đã trả.\n📄 File: ${settled.filePath}`,
  );
}

async function debtSummary(debts: DebtRepository): Promise<AgentToolResult<unknown>> {
  const summary = await debts.getSummary();

  const currencyKeys = Object.keys(summary.currencies);
  const defaultCurrency = currencyKeys.length === 1 ? currencyKeys[0] : 'VND';
  function formatAmount(amount: number): string {
    return `${amount.toLocaleString('vi-VN')} ${defaultCurrency}`;
  }

  const parts: string[] = [];
  if (summary.totalLent > 0) {
    parts.push(
      `💰 Bạn được nợ: ${formatAmount(summary.totalLent)} (${summary.pendingLentCount} khoản chưa trả)`,
    );
  }
  if (summary.totalBorrowed > 0) {
    parts.push(
      `📥 Bạn cần trả: ${formatAmount(summary.totalBorrowed)} (${summary.pendingBorrowedCount} khoản chưa trả)`,
    );
  }

  const net = summary.netPosition;
  let netText: string;
  if (net > 0) {
    netText = `🟢 Bạn là người có quyền lợi: ${formatAmount(net)}`;
  } else if (net < 0) {
    netText = `🔴 Bạn cần thanh toán: ${formatAmount(Math.abs(net))}`;
  } else {
    netText = '⚪ Mỗi khoản đã cân bằng';
  }
  parts.push(netText);

  const summaryText =
    Object.entries(summary.currencies).length > 1
      ? parts.join('\n') + '\n\n💱 Đa tiền tệ đã được tính riêng biệt.'
      : parts.join('\n');

  return successResult(summary, summaryText);
}

async function deleteDebt(
  debts: DebtRepository,
  params: { debtId?: string },
): Promise<AgentToolResult<unknown>> {
  const { debtId } = params;
  if (!debtId) throw new Error('Thiếu debtId để xóa khoản nợ.');

  const existing = await debts.getById(debtId);
  if (!existing) {
    throw new Error(`Debt ${debtId} not found`);
  }

  await debts.delete(debtId);
  return successResult({ debtId }, `🗑 Đã xóa khoản nợ ${debtId.slice(0, 8)}.`);
}
