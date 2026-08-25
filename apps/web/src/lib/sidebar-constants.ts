import type { FileNode } from './types.ts';

export const SidebarItemType = {
  FOLDER: 'Folder',
  ARCHIVE: 'Archive',
  DEBT: 'Debt',
  ARCHIVED: 'Archived',
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
  archived: {
    type: SidebarItemType.ARCHIVED,
    colorClass: 'text-[var(--text-muted)]',
    getLabel: () => SidebarItemType.ARCHIVED,
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
    (node.kind === 'debt' || node.kind === 'archived') &&
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

// The sidebar is a resizable panel. These bounds are shared between the
// panel constraints and the default-width heuristic so both stay in sync.
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;
// Matches the previous fixed `w-64` (16rem at the 14px root font size).
export const SIDEBAR_BASE_WIDTH = 224;

// Default sidebar width for a fresh layout: keep the classic width on laptop
// windows, then widen roughly proportionally on large/fullscreen windows so
// the rail stays in harmony with the centered content column.
export function defaultSidebarWidth(viewportWidth: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_BASE_WIDTH, Math.round(viewportWidth * 0.14)),
  );
}
