import type { ActiveDocument, WorkspaceEvent } from './types.ts';

const buildEnvironment = (import.meta as ImportMeta & { env?: Record<string, string> }).env ?? {};
const workspaceBase = buildEnvironment.VITE_WORKSPACE_API ?? '/api/workspace';
const apiBase = buildEnvironment.VITE_API_BASE ?? '/api';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (error) {
    throw new ApiError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network request failed',
    );
  }
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new ApiError(
      payload.error?.code ?? 'HTTP_ERROR',
      payload.error?.message ?? `Request failed (${response.status})`,
      payload.error?.details,
    );
  }
  return payload.data as T;
}

export const api = {
  listFiles: () => request<string[]>(`${workspaceBase}/fs/list?glob=${encodeURIComponent('**/*')}`),
  readFile: (path: string) =>
    request<ActiveDocument>(`${workspaceBase}/fs/read?path=${encodeURIComponent(path)}`),
  writeFile: (
    path: string,
    content: string,
    frontmatter: Record<string, unknown>,
    expectedModifiedAt?: string,
  ) =>
    request<ActiveDocument>(`${workspaceBase}/fs/write`, {
      method: 'POST',
      body: JSON.stringify({ path, content, frontmatter, expectedModifiedAt }),
    }),
  patchFile: (
    path: string,
    patch: { body?: string; frontmatter?: Record<string, unknown> },
    expectedModifiedAt?: string,
  ) =>
    request<ActiveDocument>(`${workspaceBase}/fs/patch`, {
      method: 'POST',
      body: JSON.stringify({ path, patch, expectedModifiedAt }),
    }),
  trashFile: (path: string) =>
    request<{ trashId: string; originalPath: string }>(
      `${workspaceBase}/fs/delete?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' },
    ),
  restoreFile: (trashId: string) =>
    request<ActiveDocument>(`${workspaceBase}/fs/restore`, {
      method: 'POST',
      body: JSON.stringify({ trashId }),
    }),
  createFolder: (path: string) =>
    request<{ path: string }>(`${workspaceBase}/fs/folder`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  createDebt: (data: Record<string, unknown>) =>
    request(`${workspaceBase}/debts/create`, { method: 'POST', body: JSON.stringify(data) }),
  settleDebt: (id: string) =>
    request(`${workspaceBase}/debts/${encodeURIComponent(id)}/settle`, { method: 'POST' }),
  sendMessage: (message: string, sessionId: string) =>
    request<{ response: string; sessionId: string }>(`${apiBase}/message/sync`, {
      method: 'POST',
      body: JSON.stringify({ message, sessionId }),
    }),
  subscribe: (onEvent: (event: WorkspaceEvent) => void, onError: () => void) => {
    const source = new EventSource(`${workspaceBase}/events`);
    source.onopen = () => undefined;
    source.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data) as WorkspaceEvent);
      } catch {
        /* malformed events are ignored */
      }
    };
    source.onerror = onError;
    return () => source.close();
  },
};

export { apiBase, workspaceBase };
