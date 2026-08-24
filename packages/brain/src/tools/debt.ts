import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import type { DebtRepository } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { successResult } from './result.ts';

/**
 * Format a debt document into a concise summary string with file path.
 */
function formatDebtSummary(doc: DebtDocument): string {
  const frontmatter = doc.frontmatter;
  const directionText = frontmatter.direction === DebtDirection.LENT ? 'cho vay' : 'vay';

  let statusText: string;
  if (frontmatter.status === DebtStatus.PAID) {
    statusText = '✅ Đã trả';
  } else if (frontmatter.status === DebtStatus.CANCELLED) {
    statusText = '❌ Đã hủy';
  } else {
    statusText = '⏳ Chờ thanh toán';
  }

  const amount = new Intl.NumberFormat('vi-VN').format(frontmatter.amount);

  return `💰 ${directionText} ${frontmatter.personName}: ${amount} ${frontmatter.currency} (${frontmatter.debtDate}) - ${statusText}\n📄 File: ${doc.filePath}${
    doc.reason ? `\n📝 Lý do: ${doc.reason}` : ''
  }`;
}

const debtParams = Type.Object({
  action: StringEnum(['create', 'list', 'settle', 'summary', 'delete'], {
    description: 'Hành động cần thực hiện trên khoản nợ',
  }),
  // create
  personName: Type.Optional(Type.String({ description: 'Tên người involved trong khoản này' })),
  amount: Type.Optional(Type.Number({ description: 'Số tiền (số dương)' })),
  currency: Type.Optional(Type.String({ description: 'Mã tiền tệ (mặc định: VND)' })),
  direction: Type.Optional(
    StringEnum(['lent', 'borrowed'], {
      description: 'Hướng tiền: "lent" (cho vay) hoặc "borrowed" (vay)',
    }),
  ),
  reason: Type.Optional(Type.String({ description: 'Lý do cho khoản này' })),
  debtDate: Type.Optional(Type.String({ description: 'Ngày nợ (ISO date YYYY-MM-DD)' })),
  // list
  status: Type.Optional(
    StringEnum(['pending', 'paid', 'cancelled'], { description: 'Lọc theo trạng thái' }),
  ),
  // settle / delete
  debtId: Type.Optional(Type.String({ description: 'ID của khoản nợ' })),
});

/**
 * Generic debt tool with an action discriminator.
 *
 * Each action keeps the same domain invariants as the original narrow tools:
 * creating requires the identity/amount/direction, settling flips status and
 * moves the file to the archive, deleting requires an existing debt id.
 */
export function createDebtTool(debts: DebtRepository): AgentTool<typeof debtParams> {
  return {
    name: 'debt',
    label: 'Debt',
    description:
      'Quản lý khoản nợ: tạo, liệt kê, thanh toán, tổng kết và xóa. Dùng khi người dùng đề cập cho vay/vay tiền, trả nợ, hoặc hỏi về số nợ.',
    parameters: debtParams,
    execute: async (_toolCallId, params) => {
      switch (params.action) {
        case 'create':
          return createDebt(debts, params);
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

async function createDebt(
  debts: DebtRepository,
  params: {
    personName?: string;
    amount?: number;
    direction?: string;
    currency?: string;
    reason?: string;
    debtDate?: string;
  },
): Promise<AgentToolResult<unknown>> {
  const { personName, amount, direction, reason, currency, debtDate } = params;
  if (!personName) throw new Error('Thiếu personName để tạo khoản nợ.');
  if (amount === undefined || amount < 0) throw new Error('amount phải là số dương.');
  if (!direction) throw new Error('Thiếu direction (lent/borrowed) để tạo khoản nợ.');

  const doc = await debts.create({
    direction: direction as DebtDirection,
    amount,
    currency: currency ?? 'VND',
    personName,
    reason,
    debtDate,
  });

  return successResult(doc, formatDebtSummary(doc));
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
