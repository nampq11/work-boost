import {
  Archive,
  Browser,
  CaretDown,
  CaretRight,
  Coins,
  FileText,
  Folder,
  FolderOpen,
} from '@phosphor-icons/react';
import React, { useState } from 'react';
import {
  formatNodeDisplayName,
  getSidebarItemColorClass,
  getSidebarItemType,
} from '../../lib/sidebar-constants.ts';
import type { FileNode } from '../../lib/types.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';
import './tree-view.css';

function NodeIcon({ node, isExpanded }: { node: FileNode; isExpanded?: boolean }) {
  const colorClass = getSidebarItemColorClass(node);
  if (node.kind === 'folder') {
    if (node.name === 'archive') return <Archive size={16} className={colorClass} />;
    return isExpanded ? (
      <FolderOpen size={16} weight="fill" className={colorClass} />
    ) : (
      <Folder size={16} className={colorClass} />
    );
  }
  if (node.kind === 'htmlApp') return <Browser size={16} className={colorClass} />;
  if (node.kind === 'debt') {
    return <Coins size={16} className={colorClass} />;
  }
  return <FileText size={16} className={colorClass} />;
}

function TreeNode({
  node,
  depth = 0,
  isLast = false,
}: { node: FileNode; depth?: number; isLast?: boolean }) {
  const [expanded, setExpanded] = useState(
    () => !(node.kind === 'folder' && node.name === 'daily'),
  );
  const isActive = useWorkspaceStore((state) => state.activePath === node.path);
  const selectFile = useWorkspaceStore((state) => state.selectFile);
  const closeCopilot = useUiStore((state) => state.closeCopilot);
  const isFolder = node.kind === 'folder';
  const moveFile = useWorkspaceStore((state) => state.moveFile);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const itemType = getSidebarItemType(node);
  const displayName = formatNodeDisplayName(node);
  const hasChildren = node.children && node.children.length > 0;
  const dragProps = isFolder
    ? {
        onDragOver: (event: React.DragEvent) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setIsDropTarget(true);
        },
        onDragLeave: () => setIsDropTarget(false),
        onDrop: (event: React.DragEvent) => {
          event.preventDefault();
          setIsDropTarget(false);
          const fromPath = event.dataTransfer.getData('application/x-workboost-path');
          if (fromPath) void moveFile(fromPath, node.path);
        },
      }
    : {};

  return (
    <div className="tree-node relative" data-depth={depth} data-last={isLast}>
      <div className="group relative">
        <button
          type="button"
          className={`w-full flex items-center gap-1.5 py-1.5 px-2.5 rounded text-sm transition-colors cursor-pointer select-none text-left relative ${
            isActive
              ? 'bg-[var(--surface-selected)] text-[var(--text-primary)] font-medium'
              : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
          }${isDropTarget ? ' ring-1 ring-[var(--accent-blue)]' : ''}`}
          style={{ paddingLeft: `${10 + depth * 16}px` }}
          draggable={!isFolder}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-workboost-path', node.path);
            event.dataTransfer.effectAllowed = 'move';
          }}
          {...dragProps}
          onClick={() => {
            if (isFolder) {
              setExpanded(!expanded);
            } else {
              closeCopilot();
              void selectFile(node.path);
            }
          }}
        >
          <span className="w-4 flex items-center justify-center text-[var(--text-muted)] z-10 bg-inherit">
            {isFolder && (expanded ? <CaretDown size={12} /> : <CaretRight size={12} />)}
          </span>
          <NodeIcon node={node} isExpanded={expanded} />
          <span className="truncate flex-1">{displayName}</span>
          {node.isArchived && (
            <span className="text-[10px] px-1.5 py-0.5 bg-[var(--surface-hover)] text-[var(--text-muted)] rounded uppercase font-semibold">
              archived
            </span>
          )}
        </button>
        {/* Tooltip */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-[var(--text-primary)] text-[var(--text-inverse)] text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity whitespace-nowrap z-50 pointer-events-none">
          {itemType}
        </div>
      </div>
      {isFolder &&
        expanded &&
        hasChildren &&
        node.children?.map((child, index) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            isLast={index === node.children!.length - 1}
          />
        ))}
    </div>
  );
}

export function SidebarTree({ nodes }: { nodes: FileNode[] }) {
  return (
    <div className="flex flex-col gap-0.5 sidebar-tree">
      {nodes.map((node, index) => (
        <TreeNode key={node.path} node={node} isLast={index === nodes.length - 1} />
      ))}
    </div>
  );
}
