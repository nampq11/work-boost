import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import type { DebtDocument } from '@work-boost/data-schemas/debt.ts';
import { z } from 'zod';
import type { WorkspaceFS } from '../fs/workspace-fs.ts';
import type { DailyWorkRepository } from '../repositories/daily-work-repository.ts';
import type { DebtRepository } from '../repositories/debt-repository.ts';

/**
 * The shape of a successfully created document.
 *
 * abstracted from the raw markdown so the caller (agent tool) only deals with a
 * path and a human-readable summary, never the storage format.
 */
export interface DocumentCreateResult {
  path: string;
  summary: string;
}

/**
 * A template describes how to create one kind of document: which folder it
 * lives in, how to validate the user-provided data, and how to write it.
 *
 * The template registry is the single place to add a new document type. Adding
 * a template requires no new agent tool - the generic `create_document` tool
 * dispatches to it by `type`.
 */
export interface DocumentTemplate<T = unknown> {
  type: string;
  folder: string;
  description: string;
  schema: z.ZodType<T>;
  create(data: T): Promise<DocumentCreateResult>;
}

const MAX_PATH_ATTEMPTS = 100;

/**
 * Slugify a title into a safe filename token: lowercase, diacritics stripped,
 * runs of non-alphanumeric characters collapsed into a single dash, and
 * leading/trailing dashes trimmed. Falls back to 'note' when empty.
 */
function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'note';
}

/**
 * Build a timestamp suffix (YYYYMMDD-HHMMSS). Second precision only: callers
 * must handle same-second collisions themselves.
 */
function fileStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Format a debt document into a concise summary string with file path.
 */
export function formatDebtSummary(doc: DebtDocument): string {
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

const NoteDataSchema = z.object({
  content: z.string().refine((s) => s.trim().length > 0, 'Nội dung ghi chú không được để trống.'),
  title: z.string().optional(),
});

const DebtCreateSchema = z.object({
  personName: z.string().min(1, 'Thiếu personName để tạo khoản nợ.'),
  amount: z.number().nonnegative('amount phải là số dương.'),
  direction: z.enum(['lent', 'borrowed'], { message: 'direction phải là lent hoặc borrowed.' }),
  currency: z.string().optional(),
  reason: z.string().optional(),
  debtDate: z.string().optional(),
});

const TaskItemSchema = z.object({
  project: z.string(),
  task: z.string(),
});

const DailyCreateSchema = z.object({
  date: z.string().min(1, 'Thiếu date để lưu báo cáo công việc.'),
  completed: z.array(TaskItemSchema).optional(),
  incomplete: z.array(TaskItemSchema).optional(),
  planned: z.array(TaskItemSchema).optional(),
  customSections: z.string().optional(),
});

function createNoteTemplate(fs: WorkspaceFS): DocumentTemplate<z.infer<typeof NoteDataSchema>> {
  return {
    type: 'note',
    folder: 'notes',
    description:
      'Tạo một ghi chú mới dưới dạng file Markdown trong thư mục notes/. Dùng để lưu ý tưởng, thông tin hoặc nội dung tự do không thuộc công việc hay nợ nần.',
    schema: NoteDataSchema,
    async create(data) {
      const { content, title } = data;
      const slug = slugify(title ?? '');
      const body = title ? `# ${title}\n\n${content}` : content;

      // Two captures with the same title in the same second produce the same
      // path; writeTextIfAbsent refuses to overwrite, so retry with a counter
      // suffix until a write lands.
      const stamp = fileStamp();
      let filePath = `notes/${slug}-${stamp}.md`;
      for (let attempt = 1; !(await fs.writeTextIfAbsent(filePath, body)); attempt++) {
        if (attempt >= MAX_PATH_ATTEMPTS) {
          throw new Error(
            `Không thể tạo ghi chú: đã thử ${MAX_PATH_ATTEMPTS} đường dẫn đều bị trùng.`,
          );
        }
        filePath = `notes/${slug}-${stamp}-${attempt}.md`;
      }

      return { path: filePath, summary: `📝 Đã lưu ghi chú: ${filePath}` };
    },
  };
}

function createDebtTemplate(
  debts: DebtRepository,
): DocumentTemplate<z.infer<typeof DebtCreateSchema>> {
  return {
    type: 'debt',
    folder: 'debts',
    description:
      'Tạo một khoản nợ mới trong thư mục debts/. Dùng khi người dùng cho ai vay hoặc vay ai.',
    schema: DebtCreateSchema,
    async create(data) {
      const doc = await debts.create({
        direction: data.direction as DebtDirection,
        amount: data.amount,
        currency: data.currency ?? 'VND',
        personName: data.personName,
        reason: data.reason,
        debtDate: data.debtDate,
      });
      return { path: doc.filePath, summary: formatDebtSummary(doc) };
    },
  };
}

function createDailyTemplate(
  dailyWork: DailyWorkRepository,
): DocumentTemplate<z.infer<typeof DailyCreateSchema>> {
  return {
    type: 'daily',
    folder: 'daily',
    description:
      'Lưu báo cáo công việc hằng ngày vào thư mục daily/. Dùng khi người dùng cập nhật tiến độ công việc.',
    schema: DailyCreateSchema,
    async create(data) {
      const report = {
        completed: data.completed ?? [],
        incomplete: data.incomplete ?? [],
        planned: data.planned ?? [],
      };
      const doc = await dailyWork.save(data.date, report, {
        customSections: data.customSections,
      });
      return {
        path: doc.filePath,
        summary: `📝 Đã lưu báo cáo công việc ngày ${data.date}.\n📄 File: ${doc.filePath}`,
      };
    },
  };
}

export interface DocumentTemplateDeps {
  fs: WorkspaceFS;
  debts: DebtRepository;
  dailyWork: DailyWorkRepository;
}

/**
 * Build the registry of document templates. Each entry maps a document `type`
 * to the template that knows how to validate, place, and write it. Add a new
 * document type by adding an entry here - no new agent tool required.
 */
export function createDocumentTemplates(
  deps: DocumentTemplateDeps,
): Record<string, DocumentTemplate> {
  return {
    note: createNoteTemplate(deps.fs),
    debt: createDebtTemplate(deps.debts),
    daily: createDailyTemplate(deps.dailyWork),
  };
}
