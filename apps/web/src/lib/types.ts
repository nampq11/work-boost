export interface FileNode {
  path: string;
  name: string;
  relativePath: string;
  kind: 'daily' | 'debt' | 'debt-archive' | 'html-app' | 'markdown' | 'folder';
  isArchived?: boolean;
  modifiedAt?: string;
  children?: FileNode[];
}

export interface ActiveDocument {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  rawMarkdown: string;
  size: number;
  modifiedAt: string;
  isDirty: boolean;
  lastSavedAt?: Date;
}

export interface DebtInspectorData {
  id: string;
  personName: string;
  amount: number;
  currency: string;
  direction: 'lent' | 'borrowed';
  status: 'pending' | 'paid' | 'cancelled';
  debtDate: string;
  paidAt?: string | null;
  updatedBy: string;
}

export interface WorkspaceEvent {
  paths: string[];
  kind: 'create' | 'modify' | 'remove' | 'rename' | string;
}

export type SyncStatus = 'connected' | 'reconnecting' | 'saving' | 'offline';
