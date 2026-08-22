import type { AuthLoginEvent, AuthLoginSession, AuthStatus } from '@work-boost/data-schemas/auth';
import type { ActiveDocument, WorkspaceEvent } from './types.ts';
export type { AuthLoginEvent, AuthLoginSession, AuthStatus } from '@work-boost/data-schemas/auth';
const buildEnvironment =
  (
    import.meta as ImportMeta & {
      env?: { DEV?: boolean; VITE_API_BASE?: string; VITE_WORKSPACE_API?: string };
    }
  ).env ?? {};
// Keep long-lived SSE connections off Vite's Deno proxy; aborted reloads can terminate the dev server.
const defaultApiBase = buildEnvironment.DEV ? 'http://localhost:3001/api' : '/api';
// These are `let` (not `const`) so the desktop bootstrap can override them at runtime with the live
// loopback base returned by the Tauri `get_api_base` command. The `api` methods close over these
// bindings, so they pick up the current value on each call.
let apiBase = buildEnvironment.VITE_API_BASE ?? defaultApiBase;
let workspaceBase = buildEnvironment.VITE_WORKSPACE_API ?? `${apiBase}/workspace`;

/**
 * Override the API base at runtime (used by the desktop bootstrap). Recomputes the workspace base
 * unless a workspace override (`VITE_WORKSPACE_API`) was explicitly configured.
 */
export function setApiBase(base: string): void {
  apiBase = base.replace(/\/+$/, '');
  if (!buildEnvironment.VITE_WORKSPACE_API) {
    workspaceBase = `${apiBase}/workspace`;
  }
}

export function getApiBase(): string {
  return apiBase;
}

export function getWorkspaceBase(): string {
  return workspaceBase;
}

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

export interface AssistantToolCall {
  id: string;
  name: string;
  args: unknown;
  status: 'running' | 'completed';
  result?: unknown;
  isError?: boolean;
}

export interface AssistantResponseEvent {
  type: string;
  response?: {
    id: string;
    status: string;
    outputText: string;
    toolCalls: AssistantToolCall[];
    error: { code: string; message: string } | null;
  };
  delta?: string;
}

async function* readAssistantEvents(
  responseId: string,
  signal?: AbortSignal,
): AsyncGenerator<AssistantResponseEvent> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/v1/responses/${encodeURIComponent(responseId)}`, {
      headers: { Accept: 'text/event-stream' },
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Response stream failed',
    );
  }
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<unknown>;
    throw new ApiError(
      payload.error?.code ?? 'HTTP_ERROR',
      payload.error?.message ?? `Response stream failed (${response.status})`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame
          .split('\n')
          .find((line) => line.startsWith('data:'))
          ?.slice('data:'.length)
          .trim();
        if (data) yield JSON.parse(data) as AssistantResponseEvent;
      }
    }
  } finally {
    reader.releaseLock();
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
    if (error instanceof Error && error.name === 'AbortError') throw error;
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
  createThread: () =>
    request<{ id: string }>(`${apiBase}/v1/threads`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  createResponse: (threadId: string, input: string, signal?: AbortSignal) =>
    request<{ id: string }>(`${apiBase}/v1/threads/${encodeURIComponent(threadId)}/responses`, {
      method: 'POST',
      body: JSON.stringify({ input }),
      signal,
    }),
  streamResponse: (responseId: string, signal?: AbortSignal) =>
    readAssistantEvents(responseId, signal),
  sendMessage: (message: string, sessionId: string, signal?: AbortSignal) =>
    request<{ response: string; sessionId: string }>(`${apiBase}/message/sync`, {
      method: 'POST',
      body: JSON.stringify({ message, sessionId }),
      signal,
    }),
  getAuthStatus: () => request<AuthStatus>(`${apiBase}/auth/status`),
  startAuthLogin: (provider: string, reauthenticate = false) =>
    request<AuthLoginSession>(`${apiBase}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ provider, type: 'oauth', reauthenticate }),
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
