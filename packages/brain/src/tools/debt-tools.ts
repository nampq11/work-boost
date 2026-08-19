import type { AgentTool } from '@earendil-works/pi-agent-core';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import type { DebtRepository } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { successResult } from './result.ts';

/**
 * Format a debt document into a concise summary string with file path.
 */
function formatDebtSummary(doc: DebtDocument): string {
  const fm = doc.frontmatter;
  const directionText = fm.direction === DebtDirection.LENT ? 'cho vay' : 'vay';
  const statusText =
    fm.status === DebtStatus.PAID
      ? '✅ Đã trả'
      : fm.status === DebtStatus.CANCELLED
        ? '❌ Đã hủy'
        : '⏳ Chờ thanh toán';

  const amount = new Intl.NumberFormat('vi-VN').format(fm.amount);
  const dateStr = fm.debtDate;

  return `💰 ${directionText} ${fm.personName}: ${amount} ${fm.currency} (${dateStr}) - ${statusText}\n📄 File: ${doc.filePath}${doc.reason ? `\n📝 Lý do: ${doc.reason}` : ''}`;
}

const createDebtParams = Type.Object({
  personName: Type.String({ description: 'Tên người involved trong khoản này' }),
  amount: Type.Number({ description: 'Số tiền (số dương)' }),
  currency: Type.Optional(Type.String({ description: 'Mã tiền tệ (mặc định: VND)' })),
  direction: StringEnum(['lent', 'borrowed'], {
    description: 'Hướng tiền: "lent" (cho vay) hoặc "borrowed" (vay)',
  }),
  reason: Type.Optional(Type.String({ description: 'Lý do cho khoản này' })),
  debtDate: Type.Optional(Type.String({ description: 'Ngày nợ (ISO date YYYY-MM-DD)' })),
});

/**
 * Create a new debt record as a Markdown file.
 */
export function createCreateDebtTool(debts: DebtRepository): AgentTool<typeof createDebtParams> {
  return {
    name: 'create_debt',
    label: 'Create Debt',
    description:
      'Tạo một bản ghi nợ mới dưới dạng file Markdown. Gọi sau khi đã xác định đủ thông tin: tên người, số tiền, hướng nợ (cho vay/vay), lý do và ngày.',
    parameters: createDebtParams,
    execute: async (_toolCallId, params) => {
      const { personName, amount, direction, reason, currency = 'VND', debtDate } = params;

      const doc = await debts.create({
        direction: direction as DebtDirection,
        amount,
        currency,
        personName,
        reason,
        debtDate,
      });

      return successResult(doc, formatDebtSummary(doc));
    },
  };
}

const listDebtsParams = Type.Object({
  personName: Type.Optional(Type.String({ description: 'Lọc theo tên người (khớng phần)' })),
  status: Type.Optional(
    StringEnum(['pending', 'paid', 'cancelled'], { description: 'Lọc theo trạng thái' }),
  ),
  direction: Type.Optional(StringEnum(['lent', 'borrowed'], { description: 'Lọc theo hướng nợ' })),
});

/**
 * List debts with optional filtering.
 */
export function createListDebtsTool(debts: DebtRepository): AgentTool<typeof listDebtsParams> {
  return {
    name: 'list_debts',
    label: 'List Debts',
    description: 'Liệt kê các khoản nợ, có thể lọc theo tên người, trạng thái, hoặc hướng nợ.',
    parameters: listDebtsParams,
    execute: async (_toolCallId, params) => {
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
    },
  };
}

const settleDebtParams = Type.Object({
  debtId: Type.String({ description: 'ID của khoản nợ cần đánh dấu đã trả' }),
});

/**
 * Mark a debt as paid (settled). Moves the file to the archive folder.
 */
export function createSettleDebtTool(debts: DebtRepository): AgentTool<typeof settleDebtParams> {
  return {
    name: 'settle_debt',
    label: 'Settle Debt',
    description: 'Đánh dấu một khoản nợ đã được thanh toán. Di chuyển file nợ vào thư mục lưu trữ.',
    parameters: settleDebtParams,
    execute: async (_toolCallId, params) => {
      const { debtId } = params;
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
    },
  };
}

/**
 * Calculate the net debt position (lent vs borrowed, pending vs paid).
 */
export function createGetDebtSummaryTool(debts: DebtRepository): AgentTool<any> {
  return {
    name: 'get_debt_summary',
    label: 'Get Debt Summary',
    description: 'Tính toán vị thế ròng các khoản nợ: tổng cho vay, tổng vay, số lượng chưa trả.',
    parameters: Type.Object({}),
    execute: async () => {
      const summary = await debts.getSummary();

      const currencyKeys = Object.keys(summary.currencies);
      const defaultCurrency = currencyKeys.length === 1 ? currencyKeys[0] : 'VND';
      const formatAmount = (amount: number) =>
        `${amount.toLocaleString('vi-VN')} ${defaultCurrency}`;

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
    },
  };
}

const deleteDebtParams = Type.Object({
  debtId: Type.String({ description: 'ID của khoản nợ cần xóa' }),
});

/**
 * Delete a debt record permanently.
 */
export function createDeleteDebtTool(debts: DebtRepository): AgentTool<typeof deleteDebtParams> {
  return {
    name: 'delete_debt',
    label: 'Delete Debt',
    description: 'Xóa vĩnh viễn một bản ghi nợ. Sử dụng thận trọng.',
    parameters: deleteDebtParams,
    execute: async (_toolCallId, params) => {
      const debtId = params.debtId;

      const existing = await debts.getById(debtId);
      if (!existing) {
        throw new Error(`Debt ${debtId} not found`);
      }

      await debts.delete(debtId);
      return successResult({ debtId }, `🗑 Đã xóa khoản nợ ${debtId.slice(0, 8)}.`);
    },
  };
}
