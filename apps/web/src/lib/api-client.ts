import type { ActiveDocument, WorkspaceEvent } from './types.ts';

export interface AuthStatus {
  provider: string;
  model: string;
  auth: {
    supported: boolean;
    type: 'oauth' | 'unsupported';
    status: 'connected' | 'not_connected' | 'refresh_failed' | 'unsupported';
    source?: string;
  };
}

export interface AuthLoginSession {
  loginId: string;
  provider: string;
  type: 'oauth';
  status: 'running';
  eventsUrl: string;
  expiresAt: string;
}

export type AuthLoginEvent =
  | { type: 'started'; provider: string; authType: 'oauth' }
  | { type: 'auth_url'; url: string; instructions?: string }
  | {
      type: 'device_code';
      verificationUri: string;
      userCode: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { type: 'progress'; message: string }
  | { type: 'completed'; provider: string; status: 'connected' }
  | { type: 'failed'; code: string; message: string }
  | { type: 'cancelled'; message: string };
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
  createFile: (path: string, content: string, frontmatter: Record<string, unknown>) =>
    request<ActiveDocument>(`${workspaceBase}/fs/write`, {
      method: 'POST',
      body: JSON.stringify({ path, content, frontmatter, createOnly: true }),
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
  getAuthStatus: () => request<AuthStatus>(`${apiBase}/auth/status`),
  startAuthLogin: (reauthenticate = false) =>
    request<AuthLoginSession>(`${apiBase}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ provider: 'openai-codex', type: 'oauth', reauthenticate }),
    }),
  subscribeAuthLogin: (
    loginId: string,
    onEvent: (event: AuthLoginEvent) => void,
    onError: () => void,
  ) => {
    const source = new EventSource(`${apiBase}/auth/login/${encodeURIComponent(loginId)}/events`);
    const eventTypes: AuthLoginEvent['type'][] = [
      'started',
      'auth_url',
      'device_code',
      'progress',
      'completed',
      'failed',
      'cancelled',
    ];
    const handleEvent = (event: MessageEvent<string>) => {
      try {
        onEvent(JSON.parse(event.data) as AuthLoginEvent);
      } catch {
        onError();
      }
    };
    for (const eventType of eventTypes) source.addEventListener(eventType, handleEvent);
    source.onerror = onError;
    return () => source.close();
  },
  cancelAuthLogin: (loginId: string) =>
    request<{ status: 'completed' | 'failed' | 'cancelled' }>(
      `${apiBase}/auth/login/${encodeURIComponent(loginId)}/cancel`,
      { method: 'POST' },
    ),
  logoutAuth: () =>
    request<{ provider: string; status: 'not_connected' }>(`${apiBase}/auth/logout`, {
      method: 'POST',
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
