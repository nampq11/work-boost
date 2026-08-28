import type { AuthLoginEvent, AuthLoginSession, AuthStatus } from '@work-boost/data-schemas/auth';
import type { AssistantResponseEvent } from './api-client.ts';
import { api } from './api-client.ts';
import type {
  DataPort,
  DebtCreatePayload,
  DebtFilterOptions,
  FileMoveResult,
  SidecarStatus,
  TrashResult,
} from './data-port.ts';
import type { ActiveDocument, DebtDocument, TodayDailyDocument, WorkspaceEvent } from './types.ts';

/**
 * HTTP-backed DataPort. Delegates every method to the existing `api` client.
 * Used by the browser shell, cloud deployments, and dev-mode desktop builds.
 * `getSidecarStatus` always reports `'browser'` because this port has no
 * sidecar lifecycle to track.
 */
export class HttpDataPort implements DataPort {
  listFiles(): Promise<string[]> {
    return api.listFiles();
  }

  readFile(path: string): Promise<ActiveDocument> {
    return api.readFile(path);
  }

  writeFile(
    path: string,
    content: string,
    frontmatter: Record<string, unknown>,
    expectedModifiedAt?: string,
  ): Promise<ActiveDocument> {
    return api.writeFile(path, content, frontmatter, expectedModifiedAt);
  }

  createFile(
    path: string,
    content: string,
    frontmatter: Record<string, unknown>,
  ): Promise<ActiveDocument> {
    return api.createFile(path, content, frontmatter);
  }

  patchFile(
    path: string,
    patch: { body?: string; frontmatter?: Record<string, unknown> },
    expectedModifiedAt?: string,
  ): Promise<ActiveDocument> {
    return api.patchFile(path, patch, expectedModifiedAt);
  }

  moveFile(fromPath: string, toPath: string): Promise<FileMoveResult> {
    return api.moveFile(fromPath, toPath);
  }

  trashFile(path: string): Promise<TrashResult> {
    return api.trashFile(path);
  }

  restoreFile(trashId: string): Promise<ActiveDocument> {
    return api.restoreFile(trashId);
  }

  createFolder(path: string): Promise<{ path: string }> {
    return api.createFolder(path);
  }

  subscribe(onEvent: (event: WorkspaceEvent) => void, onError: () => void): () => void {
    return api.subscribe(onEvent, onError);
  }

  getDailyToday(): Promise<TodayDailyDocument | null> {
    return api.getDailyToday();
  }

  listDebts(params?: DebtFilterOptions): Promise<DebtDocument[]> {
    return api.listDebts(params);
  }

  createDebt(data: DebtCreatePayload): Promise<unknown> {
    return api.createDebt(data);
  }

  settleDebt(id: string): Promise<unknown> {
    return api.settleDebt(id);
  }

  createThread(): Promise<{ id: string }> {
    return api.createThread();
  }

  createResponse(threadId: string, input: string, signal?: AbortSignal): Promise<{ id: string }> {
    return api.createResponse(threadId, input, signal);
  }

  streamResponse(responseId: string, signal?: AbortSignal): AsyncGenerator<AssistantResponseEvent> {
    return api.streamResponse(responseId, signal);
  }

  sendMessage(
    message: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<{ response: string; sessionId: string }> {
    return api.sendMessage(message, sessionId, signal);
  }

  getAuthStatus(): Promise<AuthStatus> {
    return api.getAuthStatus();
  }

  startAuthLogin(provider: string, reauthenticate = false): Promise<AuthLoginSession> {
    return api.startAuthLogin(provider, reauthenticate);
  }

  subscribeAuthLogin(
    loginId: string,
    onEvent: (event: AuthLoginEvent) => void,
    onError: () => void,
  ): () => void {
    return api.subscribeAuthLogin(loginId, onEvent, onError);
  }

  cancelAuthLogin(loginId: string): Promise<{ status: 'completed' | 'failed' | 'cancelled' }> {
    return api.cancelAuthLogin(loginId);
  }

  submitLoginCode(loginId: string, code: string): Promise<void> {
    return api.submitLoginCode(loginId, code);
  }

  logoutAuth(): Promise<{ provider: string; status: 'not_connected' }> {
    return api.logoutAuth();
  }
  saveApiKey(provider: string, apiKey: string): Promise<AuthStatus> {
    return api.saveApiKey(provider, apiKey);
  }

  setAIConfig(provider: string, model?: string): Promise<AuthStatus> {
    return api.setAIConfig(provider, model);
  }

  getSidecarStatus(): SidecarStatus {
    return 'browser';
  }

  onSidecarStatusChange(_callback: (status: SidecarStatus) => void): () => void {
    return () => undefined;
  }
}
