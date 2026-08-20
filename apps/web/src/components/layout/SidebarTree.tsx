import React from 'react';
import { useState } from 'react';
import type { FileNode } from '../../lib/types.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

function NodeIcon({ node }: { node: FileNode }) {
  if (node.kind === 'folder') {
    return <span className="node-icon">{node.name === 'archive' ? 'A' : 'F'}</span>;
  }
  if (node.kind === 'html-app') return <span className="node-icon app">APP</span>;
  if (node.kind === 'debt' || node.kind === 'debt-archive') {
    return <span className="node-icon debt">D</span>;
  }
  return <span className="node-icon">M</span>;
}

function TreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const selectFile = useWorkspaceStore((state) => state.selectFile);
  const isFolder = node.kind === 'folder';
  return (
    <div>
      <button
        className={`tree-row ${activePath === node.path ? 'active' : ''}`}
        style={{ paddingLeft: 10 + depth * 15 }}
        onClick={() => (isFolder ? setExpanded(!expanded) : void selectFile(node.path))}
      >
        <span className="disclosure">{isFolder ? (expanded ? '-' : '+') : ''}</span>
        <NodeIcon node={node} />
        <span className="tree-label">{node.name.replace(/\.(md|html)$/, '')}</span>
        {node.isArchived && <span className="tree-badge">archived</span>}
      </button>
      {isFolder &&
        expanded &&
        node.children?.map((child) => <TreeNode key={child.path} node={child} depth={depth + 1} />)}
    </div>
  );
}

export function SidebarTree({ nodes }: { nodes: FileNode[] }) {
  return (
    <div className="tree">
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}
