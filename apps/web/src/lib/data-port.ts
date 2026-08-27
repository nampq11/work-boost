import type { AuthLoginEvent, AuthLoginSession, AuthStatus } from '@work-boost/data-schemas/auth';
import type { AssistantResponseEvent } from './api-client.ts';
import type { ActiveDocument, DebtDocument, TodayDailyDocument, WorkspaceEvent } from './types.ts';

/**
 * Error thrown when an operation requires the API sidecar but the sidecar is
 * not available (bundled desktop build where the sidecar is starting, failed,
 * or missing). Consumers can catch this to render a graceful degraded state
 * instead of a generic network error.
 */
export class DataPortUnavailableError extends Error {
  constructor(message = 'The AI service is not available.') {
    super(message);
    this.name = 'DataPortUnavailableError';
  }
}

export type SidecarStatus = 'starting' | 'ready' | 'failed' | 'browser';

export type DebtCreatePayload = {
  personName: string;
  amount: number;
  direction: string;
  currency?: string;
  reason?: string;
  debtDate?: string;
};

export interface DebtFilterOptions {
  status?: string;
  direction?: string;
  personName?: string;
}

export interface FileMoveResult {
  fromPath: string;
  toPath: string;
}

export interface TrashResult {
  trashId: string;
  originalPath: string;
}

/**
 * Data access boundary for the frontend. The workspace store, copilot adapter,
 * and workspace sync hook program against this interface instead of a concrete
 * HTTP client.
 *
 * Two implementations exist:
 * - {@link HttpDataPort}: wraps the existing HTTP `api` client (browser,
 *   cloud, and dev-mode desktop).
 * - TauriDataPort: workspace FS ops through Tauri IPC, AI/domain/auth ops
 *   through HTTP to the sidecar when available, or typed "unavailable" errors.
 */
export interface DataPort {
  // ---- Workspace FS -----------------------------------------------------
  listFiles(): Promise<string[]>;
  readFile(path: string): Promise<ActiveDocument>;
  writeFile(
    path: string,
    content: string,
    frontmatter: Record<string, unknown>,
    expectedModifiedAt?: string,
  ): Promise<ActiveDocument>;
  createFile(
    path: string,
    content: string,
    frontmatter: Record<string, unknown>,
  ): Promise<ActiveDocument>;
  patchFile(
    path: string,
    patch: { body?: string; frontmatter?: Record<string, unknown> },
    expectedModifiedAt?: string,
  ): Promise<ActiveDocument>;
  moveFile(fromPath: string, toPath: string): Promise<FileMoveResult>;
  trashFile(path: string): Promise<TrashResult>;
  restoreFile(trashId: string): Promise<ActiveDocument>;
  createFolder(path: string): Promise<{ path: string }>;

  // ---- Workspace events -------------------------------------------------
  subscribe(onEvent: (event: WorkspaceEvent) => void, onError: () => void): () => void;

  // ---- Workspace domain (debts, daily) ----------------------------------
  getDailyToday(): Promise<TodayDailyDocument | null>;
  listDebts(params?: DebtFilterOptions): Promise<DebtDocument[]>;
  createDebt(data: DebtCreatePayload): Promise<unknown>;
  settleDebt(id: string): Promise<unknown>;

  // ---- AI ---------------------------------------------------------------
  createThread(): Promise<{ id: string }>;
  createResponse(threadId: string, input: string, signal?: AbortSignal): Promise<{ id: string }>;
  streamResponse(responseId: string, signal?: AbortSignal): AsyncGenerator<AssistantResponseEvent>;
  sendMessage(
    message: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<{
    response: string;
    sessionId: string;
  }>;

  // ---- Auth -------------------------------------------------------------
  getAuthStatus(): Promise<AuthStatus>;
  startAuthLogin(provider: string, reauthenticate?: boolean): Promise<AuthLoginSession>;
  subscribeAuthLogin(
    loginId: string,
    onEvent: (event: AuthLoginEvent) => void,
    onError: () => void,
  ): () => void;
  cancelAuthLogin(loginId: string): Promise<{ status: 'completed' | 'failed' | 'cancelled' }>;
  logoutAuth(): Promise<{ provider: string; status: 'not_connected' }>;

  // ---- Sidecar lifecycle ------------------------------------------------
  /** Current AI sidecar state. `'browser'` when running in a plain browser (no sidecar concept). */
  getSidecarStatus(): SidecarStatus;
  /** Subscribe to sidecar state transitions. Returns an unsubscribe function. */
  onSidecarStatusChange(callback: (status: SidecarStatus) => void): () => void;
  /** Attempt to restart a failed sidecar. No-op when not applicable. */
  retrySidecar?(): Promise<void>;
}
