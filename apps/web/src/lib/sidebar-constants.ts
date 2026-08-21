import type { FileNode } from './types.ts';

export const SidebarItemType = {
  FOLDER: 'Folder',
  ARCHIVE: 'Archive',
  DEBT: 'Debt',
  DEBT_ARCHIVE: 'Archived Debt',
  BOARD_VIEW: 'Board view',
  NOTE: 'Note',
  DAILY: 'Daily note',
} as const;

export type SidebarItemTypeValue = (typeof SidebarItemType)[keyof typeof SidebarItemType];

export interface SidebarItemConfig {
  type: SidebarItemTypeValue;
  colorClass: string;
  getLabel: (node: FileNode) => SidebarItemTypeValue;
}

export const SIDEBAR_ITEM_CONFIG: Record<FileNode['kind'], SidebarItemConfig> = {
  folder: {
    type: SidebarItemType.FOLDER,
    colorClass: 'text-[var(--text-muted)]',
    getLabel: (node: FileNode) => {
      if (node.name === 'archive') return SidebarItemType.ARCHIVE;
      return SidebarItemType.FOLDER;
    },
  },
  markdown: {
    type: SidebarItemType.NOTE,
    colorClass: 'text-[var(--text-muted)]',
    getLabel: () => SidebarItemType.NOTE,
  },
  daily: {
    type: SidebarItemType.DAILY,
    colorClass: 'text-[var(--text-muted)]',
    getLabel: () => SidebarItemType.DAILY,
  },
  debt: {
    type: SidebarItemType.DEBT,
    colorClass: 'text-[var(--accent-green)]',
    getLabel: () => SidebarItemType.DEBT,
  },
  'debt-archive': {
    type: SidebarItemType.DEBT_ARCHIVE,
    colorClass: 'text-[var(--accent-green)]',
    getLabel: () => SidebarItemType.DEBT_ARCHIVE,
  },
  'html-app': {
    type: SidebarItemType.BOARD_VIEW,
    colorClass: 'text-[var(--accent-orange)]',
    getLabel: () => SidebarItemType.BOARD_VIEW,
  },
};

export function getSidebarItemType(node: FileNode): SidebarItemTypeValue {
  return SIDEBAR_ITEM_CONFIG[node.kind]?.getLabel(node) || SidebarItemType.NOTE;
}

export function getSidebarItemColorClass(node: FileNode): string {
  return SIDEBAR_ITEM_CONFIG[node.kind]?.colorClass || 'text-[var(--text-muted)]';
}

export function formatNodeDisplayName(node: FileNode): string {
  const baseName = node.name.replace(/\.(md|html)$/, '');

  // Handle auto-generated debt note titles (e.g., "nam-6d98")
  if (
    (node.kind === 'debt' || node.kind === 'debt-archive') &&
    /^[a-z0-9]+-[a-z0-9]+$/.test(baseName)
  ) {
    return `Debt (${baseName})`;
  }

  // Handle ID-style titles with fallback formatter
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(baseName)) {
    return `Untitled (${baseName.slice(0, 8)}...)`;
  }

  if (/^[a-z0-9]+$/.test(baseName) && baseName.length > 12) {
    return baseName.slice(0, 12) + '...';
  }

  return baseName;
}
