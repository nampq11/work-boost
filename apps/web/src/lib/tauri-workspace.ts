import { invoke } from '@tauri-apps/api/core';

// Thin typed wrappers over the Rust `workspace_*` IPC commands.
// The Rust side does raw file I/O with path containment and compare-and-swap;
// all workspace domain logic (markdown parsing, trash protocol) lives in the
// TauriDataPort renderer code.

export interface RawFile {
  path: string;
  body: string;
  size: number;
  modifiedAt: string;
}

export interface FileStat {
  size: number;
  modifiedAt: string;
}

export interface WriteResult {
  path: string;
  size: number;
  modifiedAt: string;
}

export function workspaceInit(): Promise<void> {
  return invoke('workspace_init');
}

export function workspaceReadFile(path: string): Promise<RawFile> {
  return invoke('workspace_read_file', { path });
}

export function workspaceWriteFile(
  path: string,
  content: string,
  expectedModifiedAt?: string,
): Promise<WriteResult> {
  return invoke('workspace_write_file', { path, content, expectedModifiedAt });
}

export function workspaceCreateFile(path: string, content: string): Promise<RawFile> {
  return invoke('workspace_create_file', { path, content });
}

export function workspaceListFiles(glob = '**/*'): Promise<string[]> {
  return invoke('workspace_list_files', { glob });
}

export function workspaceStat(path: string): Promise<FileStat> {
  return invoke('workspace_stat', { path });
}

export function workspaceMove(from: string, to: string): Promise<void> {
  return invoke('workspace_move', { from, to });
}

export function workspaceRemove(path: string): Promise<void> {
  return invoke('workspace_remove', { path });
}

export function workspaceMkdir(path: string): Promise<void> {
  return invoke('workspace_mkdir', { path });
}

export function workspaceExists(path: string): Promise<boolean> {
  return invoke('workspace_exists', { path });
}

/** Event emitted by the Rust watcher, matching the server's `WorkspaceChangeEvent`. */
export interface TauriWorkspaceChangeEvent {
  paths: string[];
  kind: string;
}
