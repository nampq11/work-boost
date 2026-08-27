import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AuthLoginEvent, AuthLoginSession, AuthStatus } from '@work-boost/data-schemas/auth';
import type { TrashRecord } from '@work-boost/shared/trash-record.ts';
import { guardWorkspacePath } from '@work-boost/shared/workspace-path.ts';
import { ApiError, setApiBase, setHttpFetch } from './api-client.ts';
import type { AssistantResponseEvent } from './api-client.ts';
import type {
  DataPort,
  DebtCreatePayload,
  DebtFilterOptions,
  FileMoveResult,
  SidecarStatus,
  TrashResult,
} from './data-port.ts';
import { DataPortUnavailableError } from './data-port.ts';
import { HttpDataPort } from './http-data-port.ts';
import { parseFrontmatter, stringifyMarkdown, stripFrontmatter } from './markdown-parser.ts';
import {
  workspaceCreateFile,
  workspaceExists,
  workspaceInit,
  workspaceListFiles,
  workspaceMkdir,
  workspaceMove,
  workspaceReadFile,
  workspaceRemove,
  workspaceWriteFile,
} from './tauri-workspace.ts';
import type { ActiveDocument, DebtDocument, TodayDailyDocument, WorkspaceEvent } from './types.ts';

interface SidecarStatusPayload {
  state: 'starting' | 'ready' | 'failed';
  base?: string;
  error?: string;
  retryable?: boolean;
}

/**
 * Tauri-backed DataPort for bundled desktop builds.
 *
 * Workspace FS operations go through Tauri IPC commands (Rust reads/writes
 * `~/.workboost/workspace/` directly). AI, auth, and domain-heavy operations
 * (debts, daily) go through HTTP to the sidecar when it is ready, or throw a
 * typed `DataPortUnavailableError` when it is not.
 */
export class TauriDataPort implements DataPort {
  private readonly http = new HttpDataPort();
  private httpBase: string | null = null;
  private sidecarStatus: SidecarStatus = 'starting';
  private statusListeners = new Set<(status: SidecarStatus) => void>();
  private unsubscribeEvents: (() => void) | null = null;

  /** Initialize workspace directories and capture the sidecar lifecycle state. */
  async init(): Promise<void> {
    installSidecarHttpProxy();
    await workspaceInit();
    // Subscribe before querying: a transition that fires while the listeners
    // are being registered (or later) is captured by the events, and the query
    // that follows reconciles any state that predates the subscription. The
    // reverse order would miss transitions in the gap between query and listen.
    const unsubReady = await listen<{ base: string }>('sidecar-ready', (event) => {
      this.httpBase = event.payload.base;
      // Route the HTTP-backed operations (AI, auth, debts, daily) at the sidecar's
      // loopback base. Without this, the module-level `api` client would keep the
      // production default `/api` (the webview origin), and every request would hit
      // `tauri://localhost/api/...` instead of `http://127.0.0.1:<port>/api/...`.
      setApiBase(event.payload.base);
      this.setSidecarStatus('ready');
    });
    const unsubFailed = await listen<{ error: string; retryable: boolean }>(
      'sidecar-failed',
      () => {
        this.httpBase = null;
        this.setSidecarStatus('failed');
      },
    );
    const unsubStarting = await listen('sidecar-starting', () => {
      this.httpBase = null;
      this.setSidecarStatus('starting');
    });
    this.unsubscribeEvents = () => {
      unsubReady();
      unsubFailed();
      unsubStarting();
    };
    await this.refreshSidecarStatus();
  }

  private async refreshSidecarStatus(): Promise<void> {
    try {
      const status = await invoke<SidecarStatusPayload>('get_sidecar_status');
      if (status.state === 'ready') {
        this.httpBase = status.base ?? null;
        if (status.base) setApiBase(status.base);
        this.setSidecarStatus('ready');
      } else if (status.state === 'failed') {
        this.httpBase = null;
        this.setSidecarStatus('failed');
      } else {
        this.httpBase = null;
        this.setSidecarStatus('starting');
      }
    } catch {
      // The sidecar command may not exist yet in dev builds; keep "starting".
      this.setSidecarStatus('starting');
    }
  }

  private setSidecarStatus(status: SidecarStatus): void {
    this.sidecarStatus = status;
    for (const listener of this.statusListeners) listener(status);
  }

  getSidecarStatus(): SidecarStatus {
    return this.sidecarStatus;
  }

  onSidecarStatusChange(callback: (status: SidecarStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  async retrySidecar(): Promise<void> {
    await invoke('retry_sidecar');
  }

  // ---- Workspace FS (Tauri IPC) ------------------------------------------

  async listFiles(): Promise<string[]> {
    const paths = await workspaceListFiles();
    return paths.filter((path) => guardWorkspacePath(path) === null);
  }

  async readFile(path: string): Promise<ActiveDocument> {
    const guard = guardWorkspacePath(path);
    if (guard) throw new ApiError('FORBIDDEN', guard);
    const raw = await workspaceReadFile(path);
    const { frontmatter, body } = this.parseForPath(raw.body, path);
    return {
      path: raw.path,
      frontmatter,
      body,
      rawMarkdown: stringifyMarkdown(frontmatter, body),
      size: raw.size,
      modifiedAt: raw.modifiedAt,
      isDirty: false,
    };
  }

  async writeFile(
    path: string,
    content: string,
    frontmatter: Record<string, unknown>,
    expectedModifiedAt?: string,
  ): Promise<ActiveDocument> {
    const guard = guardWorkspacePath(path);
    if (guard) throw new ApiError('FORBIDDEN', guard);
    const raw = isMarkdownFile(path) ? stringifyMarkdown(frontmatter, content) : content;
    const result = await workspaceWriteFile(path, raw, expectedModifiedAt);
    const { frontmatter: parsedFm, body } = this.parseForPath(raw, path);
    return {
      path,
      frontmatter: parsedFm,
      body,
      rawMarkdown: raw,
      size: result.size,
      modifiedAt: result.modifiedAt,
      isDirty: false,
    };
  }

  async createFile(
    path: string,
    content: string,
    frontmatter: Record<string, unknown>,
  ): Promise<ActiveDocument> {
    const guard = guardWorkspacePath(path);
    if (guard) throw new ApiError('FORBIDDEN', guard);
    const raw = isMarkdownFile(path) ? stringifyMarkdown(frontmatter, content) : content;
    const created = await workspaceCreateFile(path, raw);
    const { frontmatter: parsedFm, body } = this.parseForPath(raw, path);
    return {
      path,
      frontmatter: parsedFm,
      body,
      rawMarkdown: raw,
      size: created.size,
      modifiedAt: created.modifiedAt,
      isDirty: false,
    };
  }

  async patchFile(
    path: string,
    patch: { body?: string; frontmatter?: Record<string, unknown> },
    expectedModifiedAt?: string,
  ): Promise<ActiveDocument> {
    const guard = guardWorkspacePath(path);
    if (guard) throw new ApiError('FORBIDDEN', guard);
    // Read current content, merge the patch renderer-side, write with CAS.
    const current = await workspaceReadFile(path);
    const { frontmatter, body } = this.parseForPath(current.body, path);
    const mergedFrontmatter = { ...frontmatter, ...patch.frontmatter };
    const mergedBody = patch.body !== undefined ? patch.body : body;
    const raw = isMarkdownFile(path)
      ? stringifyMarkdown(mergedFrontmatter, mergedBody)
      : mergedBody;
    try {
      const result = await workspaceWriteFile(path, raw, expectedModifiedAt);
      return {
        path,
        frontmatter: mergedFrontmatter,
        body: mergedBody,
        rawMarkdown: raw,
        size: result.size,
        modifiedAt: result.modifiedAt,
        isDirty: false,
      };
    } catch (error) {
      if (typeof error === 'string' && error.startsWith('CONFLICT')) {
        throw new ApiError('CONFLICT', 'The file changed on disk. Reload it before saving again.');
      }
      throw error;
    }
  }

  async moveFile(fromPath: string, toPath: string): Promise<FileMoveResult> {
    const fromGuard = guardWorkspacePath(fromPath);
    if (fromGuard) throw new ApiError('FORBIDDEN', fromGuard);
    const toGuard = guardWorkspacePath(toPath);
    if (toGuard) throw new ApiError('FORBIDDEN', toGuard);
    await workspaceMove(fromPath, toPath);
    return { fromPath, toPath };
  }

  async trashFile(path: string): Promise<TrashResult> {
    const guard = guardWorkspacePath(path);
    if (guard) throw new ApiError('FORBIDDEN', guard);
    if (!(await workspaceExists(path))) {
      throw new ApiError('NOT_FOUND', `File not found: ${path}`);
    }
    return this.moveToTrash(path);
  }

  async restoreFile(trashId: string): Promise<ActiveDocument> {
    return this.restoreFromTrash(trashId);
  }

  async createFolder(path: string): Promise<{ path: string }> {
    const guard = guardWorkspacePath(path);
    if (guard) throw new ApiError('FORBIDDEN', guard);
    await workspaceMkdir(path);
    return { path };
  }

  // ---- Trash journal protocol --------------------------------------------
  // Replicates the server's crash-recoverable protocol using Rust IPC.

  private async moveToTrash(path: string): Promise<TrashResult> {
    const trashId = crypto.randomUUID();
    const trashDir = '.workboost/trash';
    const journalPath = `${trashDir}/${trashId}.journal.json`;
    const dataPath = `${trashDir}/${trashId}.data`;
    const metaPath = `${trashDir}/${trashId}.json`;
    const record: TrashRecord = {
      trashId,
      originalPath: path,
      trashPath: dataPath,
      deletedAt: new Date().toISOString(),
    };

    // Step 1: write intent journal (survives a crash at any later step)
    await workspaceCreateFile(journalPath, JSON.stringify(record));
    // Step 2: move the file into trash
    try {
      await workspaceMove(path, dataPath);
    } catch (error) {
      // Move failed; the journal is now stale, remove it.
      await workspaceRemove(journalPath).catch(() => undefined);
      throw error;
    }
    // Step 3: write metadata
    try {
      await workspaceWriteFile(metaPath, JSON.stringify(record));
    } catch {
      // Compensate: move the file back and clean the journal.
      await workspaceMove(dataPath, path).catch(() => undefined);
      await workspaceRemove(journalPath).catch(() => undefined);
      throw new Error('Trash operation failed');
    }
    return { trashId, originalPath: path };
  }

  private async restoreFromTrash(trashId: string): Promise<ActiveDocument> {
    if (!/^[0-9a-f-]{36}$/i.test(trashId)) throw new Error('Invalid trash id');
    const trashDir = '.workboost/trash';
    const metaPath = `${trashDir}/${trashId}.json`;
    const journalPath = `${trashDir}/${trashId}.journal.json`;
    const dataPath = `${trashDir}/${trashId}.data`;

    const hasMeta = await workspaceExists(metaPath);
    const hasJournal = await workspaceExists(journalPath);
    if (!hasMeta && !hasJournal) throw new ApiError('NOT_FOUND', 'Trash item not found');

    const recordPath = hasMeta ? metaPath : journalPath;
    const raw = await workspaceReadFile(recordPath);
    const record = JSON.parse(raw.body) as Partial<TrashRecord>;
    if (
      !record.originalPath ||
      !record.trashPath ||
      record.trashPath !== dataPath ||
      guardWorkspacePath(record.originalPath) !== null
    ) {
      throw new Error('Invalid trash metadata');
    }

    // If the original path is already occupied, and the trash copy is gone,
    // treat the item as restored and clean up the metadata.
    if (await workspaceExists(record.originalPath)) {
      if (!(await workspaceExists(record.trashPath))) {
        await workspaceRemove(metaPath).catch(() => undefined);
        await workspaceRemove(journalPath).catch(() => undefined);
        return this.readFile(record.originalPath);
      }
      throw new Error('Cannot restore: destination already exists');
    }
    if (!(await workspaceExists(record.trashPath))) {
      throw new ApiError('NOT_FOUND', 'Trash item not found');
    }

    // Write journal, move the data back, clean metadata + journal.
    await workspaceWriteFile(journalPath, JSON.stringify(record));
    await workspaceMove(record.trashPath, record.originalPath);
    try {
      if (await workspaceExists(metaPath)) await workspaceRemove(metaPath);
    } catch (error) {
      // Compensate: move the file back so the journal + trash data stay
      // consistent for a later restore attempt (mirrors the server's protocol).
      await workspaceMove(record.originalPath, record.trashPath).catch(() => undefined);
      throw error;
    }
    await workspaceRemove(journalPath).catch(() => undefined);
    return this.readFile(record.originalPath);
  }

  // ---- Workspace events --------------------------------------------------

  subscribe(onEvent: (event: WorkspaceEvent) => void, onError: () => void): () => void {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    void listen<{ paths: string[]; kind: string }>('workspace-changed', (event) => {
      if (cancelled) return;
      onEvent({ paths: event.payload.paths, kind: event.payload.kind });
    })
      .then((unsub) => {
        if (cancelled) {
          unsub();
        } else {
          unsubscribe = unsub;
        }
      })
      .catch(() => {
        if (!cancelled) onError();
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }

  // ---- Workspace domain / AI / auth (HTTP to sidecar, or unavailable) ----

  private requireHttp<T>(operation: () => Promise<T>): Promise<T> {
    if (this.httpBase === null) {
      return Promise.reject(new DataPortUnavailableError());
    }
    return operation();
  }

  getDailyToday(): Promise<TodayDailyDocument | null> {
    return this.requireHttp(() => this.http.getDailyToday());
  }

  listDebts(params?: DebtFilterOptions): Promise<DebtDocument[]> {
    return this.requireHttp(() => this.http.listDebts(params));
  }

  createDebt(data: DebtCreatePayload): Promise<unknown> {
    return this.requireHttp(() => this.http.createDebt(data));
  }

  settleDebt(id: string): Promise<unknown> {
    return this.requireHttp(() => this.http.settleDebt(id));
  }

  createThread(): Promise<{ id: string }> {
    return this.requireHttp(() => this.http.createThread());
  }

  createResponse(threadId: string, input: string, signal?: AbortSignal): Promise<{ id: string }> {
    return this.requireHttp(() => this.http.createResponse(threadId, input, signal));
  }

  streamResponse(responseId: string, signal?: AbortSignal): AsyncGenerator<AssistantResponseEvent> {
    // Throwing synchronously surfaces the typed error to the copilot adapter's
    // try/catch around the stream loop, instead of forcing it to iterate a
    // generator before discovering the failure.
    if (this.httpBase === null) {
      throw new DataPortUnavailableError();
    }
    return this.http.streamResponse(responseId, signal);
  }

  sendMessage(
    message: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<{ response: string; sessionId: string }> {
    return this.requireHttp(() => this.http.sendMessage(message, sessionId, signal));
  }

  getAuthStatus(): Promise<AuthStatus> {
    return this.requireHttp(() => this.http.getAuthStatus());
  }

  startAuthLogin(provider: string, reauthenticate = false): Promise<AuthLoginSession> {
    return this.requireHttp(() => this.http.startAuthLogin(provider, reauthenticate));
  }

  subscribeAuthLogin(
    loginId: string,
    onEvent: (event: AuthLoginEvent) => void,
    onError: () => void,
  ): () => void {
    // The sidecar must be available to stream login progress.
    if (this.httpBase === null) {
      onError();
      return () => undefined;
    }
    return this.http.subscribeAuthLogin(loginId, onEvent, onError);
  }

  cancelAuthLogin(loginId: string): Promise<{ status: 'completed' | 'failed' | 'cancelled' }> {
    return this.requireHttp(() => this.http.cancelAuthLogin(loginId));
  }

  logoutAuth(): Promise<{ provider: string; status: 'not_connected' }> {
    return this.requireHttp(() => this.http.logoutAuth());
  }

  // ---- Helpers -----------------------------------------------------------

  private parseForPath(
    raw: string,
    path: string,
  ): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    if (!isMarkdownFile(path)) return { frontmatter: {}, body: raw };
    try {
      return parseFrontmatter(raw);
    } catch (error) {
      // Corrupted frontmatter degrades to body-only, mirroring the server's
      // `safeParseMarkdown` fallback (spec NFR-04). Returning `raw` here would
      // leak the `---` block into the editor body and bake it in on save.
      console.warn(
        `[TauriDataPort] Corrupted markdown frontmatter, serving body only: ${path}`,
        error instanceof Error ? error.message : error,
      );
      return { frontmatter: {}, body: stripFrontmatter(raw) };
    }
  }
}

/** True for markdown document paths; other extensions are stored as plain content. */
function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/**
 * Replace the renderer's `fetch` with a Rust proxy for the sidecar. The webview
 * cannot reliably reach `http://127.0.0.1:<random-port>` from the
 * `http(s)://tauri.localhost` origin: the request is cross-origin and is subject
 * to the webview's CSP `connect-src`, the API's CORS, and (on the https macOS
 * webview) mixed-content blocking. The proxy resolves the sidecar URL from the
 * authoritative Rust `SidecarManager` state and performs the request with
 * `reqwest`, so none of those webview restrictions apply.
 */
function installSidecarHttpProxy(): void {
  setHttpFetch(async (input, init) => {
    const url = new URL(input, 'http://127.0.0.1');
    const path = url.pathname + url.search;
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const acceptsStream = headers.get('Accept') === 'text/event-stream';

    let body: unknown;
    if (typeof init?.body === 'string' && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }

    if (acceptsStream) {
      return new Response(createSidecarStream(method, path, body), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    const result = await invoke<{ status: number; body: string }>('sidecar_request', {
      request: { method, path, body },
    });
    return new Response(result.body, { status: result.status });
  });
}

/** Bridge the Rust `sidecar_stream` channel into a fetch-visible body stream. */
function createSidecarStream(
  method: string,
  path: string,
  body: unknown,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const channel = new Channel<string>();
      channel.onmessage = (message) => {
        if (!closed) controller.enqueue(encoder.encode(message));
      };
      void invoke('sidecar_stream', { request: { method, path, body }, onEvent: channel })
        .then(() => {
          if (!closed) controller.close();
        })
        .catch((error: unknown) => {
          if (!closed) controller.error(error instanceof Error ? error : new Error(String(error)));
        });
    },
  });
}
