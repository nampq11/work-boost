export interface TrashRecord {
  trashId: string;
  originalPath: string;
  trashPath: string;
  deletedAt: string;
}

export function validateTrashRecord(record: unknown): record is TrashRecord {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.trashId === 'string' &&
    typeof r.originalPath === 'string' &&
    typeof r.trashPath === 'string' &&
    typeof r.deletedAt === 'string'
  );
}
