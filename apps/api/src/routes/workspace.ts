import type { DataLayer } from '@work-boost/data-provider';
import {
  createWorkspaceWatcher,
  type WorkspaceChangeEvent,
} from '@work-boost/data-provider/fs/workspace-watcher.ts';
import {
  parseMarkdown,
  stringifyMarkdown,
} from '@work-boost/data-provider/markdown/markdown-engine.ts';
import type { DailyWorkReport } from '@work-boost/data-schemas/agent.ts';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import { readBrokerRuntime } from '@work-boost/runtime';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { injectHtmlAppRuntime } from '../utils/html-injector.ts';
import { ERROR_CODES, errorResponse, successResponse } from '../utils/response.ts';
import { isValidUUID } from '../utils/security.ts';

export interface WorkspaceRouterDeps {
  dataLayer: DataLayer;
  /** API prefix configured for the server (e.g. '/api'), defaults to '/api' */
  apiPrefix?: string;
}

// ============================================================================
// Security policy (spec NFR-02/03)
// ============================================================================

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
const SENSITIVE_SEGMENTS = new Set(['..', '.env', '.git']);
const ALLOWED_EXTENSIONS = ['.md', '.json', '.txt', '.html'];
const APPS_BASE = '/workspace-apps';
const CSP_POLICY = [
  'sandbox allow-scripts allow-forms allow-same-origin',
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

function isPathForbidden(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => SENSITIVE_SEGMENTS.has(segment))) return true;
  if (segments.at(-1) === 'config.json' && segments.at(-2) === '.workboost') return true;
  return false;
}

function hasAllowedExtension(path: string): boolean {
  const extension = path.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  return ALLOWED_EXTENSIONS.includes(extension);
}

function isLoopback(info?: Deno.ServeHandlerInfo): boolean {
  const hostname = (info as unknown as { remote?: { hostname?: string } })?.remote?.hostname;
  // No remote info available means the request did not come through a socket
  // (in-process calls); treat it as local.
  if (!hostname) return true;
  return LOOPBACK_HOSTNAMES.has(hostname);
}

// ============================================================================
// Helpers
// ============================================================================

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function ok(data: unknown, requestId?: string): Response {
  return withNoStore(successResponse(data, 200, requestId));
}

function created(data: unknown, requestId?: string): Response {
  return withNoStore(successResponse(data, 201, requestId));
}

function fail(
  code: string,
  message: string,
  status: number,
  requestId?: string,
  details?: unknown,
): Response {
  return withNoStore(errorResponse(code, message, status, details, requestId));
}

function notFound(what: string, requestId?: string): Response {
  return fail(ERROR_CODES.NOT_FOUND, `${what} not found`, 404, requestId);
}

function accessDenied(requestId?: string): Response {
  return fail(ERROR_CODES.FORBIDDEN, 'Access Denied', 403, requestId);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Validate a workspace path against blacklist + extension whitelist. */
function guardPath(path: string, requestId?: string): Response | null {
  if (!path) {
    return fail(
      ERROR_CODES.VALIDATION_ERROR,
      'Missing required query parameter: path',
      400,
      requestId,
    );
  }
  if (isPathForbidden(path)) return accessDenied(requestId);
  if (!hasAllowedExtension(path)) {
    return accessDenied(requestId);
  }
  return null;
}

function getCurrentDateInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

interface ParsedMarkdownFile {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  size: number;
  modifiedAt: string;
}

/** Parse markdown tolerantly: broken YAML degrades to body-only (spec NFR-04). */
function stripFrontmatter(raw: string): string {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return raw.trim();
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      close = i;
      break;
    }
  }
  return (close === -1 ? raw : lines.slice(close + 1).join('\n')).trim();
}

function safeParseMarkdown(
  raw: string,
  path: string,
): { frontmatter: Record<string, unknown>; body: string } {
  if (!path.toLowerCase().endsWith('.md')) {
    return { frontmatter: {}, body: raw };
  }
  try {
    return parseMarkdown<Record<string, unknown>>(raw);
  } catch (error) {
    logger.warn('Corrupted markdown frontmatter, serving body only', {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return { frontmatter: {}, body: stripFrontmatter(raw) };
  }
}

// ============================================================================
// SSE event hub
// ============================================================================

interface EventHub {
  subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void;
  registerStream(controller: ReadableStreamDefaultController<Uint8Array>): () => void;
  stop(): void;
}

function createEventHub(fs: DataLayer['fs']): EventHub {
  const listeners = new Set<(event: WorkspaceChangeEvent) => void>();
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let watcherStarted = false;
  let watcher: ReturnType<typeof createWorkspaceWatcher> | undefined;

  // Start lazily so server processes that never open an SSE stream do not hold an FS watcher.
  function ensureWatcher(): void {
    if (watcherStarted) return;
    watcherStarted = true;
    watcher = createWorkspaceWatcher(fs, (event) => {
      for (const listener of listeners) listener(event);
    });
    watcher.start();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      ensureWatcher();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          watcher?.stop();
          watcher = undefined;
          watcherStarted = false;
        }
      };
    },
    registerStream(controller) {
      streams.add(controller);
      return () => streams.delete(controller);
    },
    stop() {
      watcher?.stop();
      watcher = undefined;
      watcherStarted = false;
      listeners.clear();
      for (const stream of streams) {
        try {
          stream.close();
        } catch {
          // The client may have already closed the stream.
        }
      }
      streams.clear();
    },
  };
}

function sseResponse(hub: EventHub): Response {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const pendingEvents: WorkspaceChangeEvent[] = [];
  let closed = false;
  let unregisterStream: (() => void) | undefined;
  const unsubscribe = hub.subscribe((event) => {
    if (!controller) {
      pendingEvents.push(event);
      return;
    }

    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // Stream already closed by the client; nothing to do.
    }
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    unregisterStream?.();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      unregisterStream = hub.registerStream(streamController);
      controller.enqueue(encoder.encode('retry: 3000\n\n'));
      for (const event of pendingEvents.splice(0)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ============================================================================
// Daily report payload validation
// ============================================================================

const REPORT_SECTIONS = ['completed', 'incomplete', 'planned'] as const;

function parseReportPayload(body: Record<string, unknown>): {
  report: DailyWorkReport;
  customSections: string | undefined;
} | null {
  const { report, customSections } = body;
  if (typeof report !== 'object' || report === null || Array.isArray(report)) return null;
  if (customSections !== undefined && typeof customSections !== 'string') return null;

  const result: DailyWorkReport = { completed: [], incomplete: [], planned: [] };
  for (const section of REPORT_SECTIONS) {
    const items = (report as Record<string, unknown>)[section];
    if (items === undefined) continue;
    if (!Array.isArray(items)) return null;
    for (const item of items) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
      const { project, task } = item as Record<string, unknown>;
      if (typeof task !== 'string' || task.trim() === '') return null;
      result[section].push({
        project: typeof project === 'string' && project.trim() ? project : 'INBOX',
        task,
      });
    }
  }

  return {
    report: result,
    customSections: typeof customSections === 'string' ? customSections : undefined,
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ============================================================================
// Router
// ============================================================================

export interface WorkspaceRouter {
  handle(request: Request, info?: Deno.ServeHandlerInfo): Promise<Response>;
  stop(): void;
}

export function createWorkspaceRouter(deps: WorkspaceRouterDeps): WorkspaceRouter {
  const { fs, config, dailyWork, debts } = deps.dataLayer;
  const apiPrefix = deps.apiPrefix ?? '/api';
  const workspaceBase = `${apiPrefix}/workspace`;
  const hub = createEventHub(fs);

  async function handleWorkspaceApp(request: Request, pathname: string): Promise<Response> {
    const filename = pathname.slice(APPS_BASE.length + 1);
    if (!/^[\w.-]+\.html$/.test(filename)) return notFound('HTML app', undefined);

    if (!(await fs.exists(filename))) return notFound(filename, undefined);

    const rawHtml = await fs.readText(filename);
    const runtime = await readBrokerRuntime();
    const runtimeBundleJs = `window.__WORKBOOST_API_BASE__=${
      JSON.stringify(workspaceBase)
    };\n${runtime.js}`;
    const html = injectHtmlAppRuntime(rawHtml, runtimeBundleJs, runtime.themeCss);

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Security-Policy': CSP_POLICY,
      },
    });
  }

  async function readWorkspaceFile(path: string): Promise<ParsedMarkdownFile> {
    const raw = await fs.readText(path);
    const { size, modifiedAt } = await fs.stat(path);
    const { frontmatter, body } = safeParseMarkdown(raw, path);
    return { path, frontmatter, body, size, modifiedAt };
  }

  async function handleApi(request: Request, url: URL): Promise<Response> {
    const method = request.method;
    const route = url.pathname.slice(workspaceBase.length); // e.g. '/fs/read'
    const query = url.searchParams;

    // ------------------------------------------------------------------
    // SSE events
    // ------------------------------------------------------------------
    if (route === '/events' && method === 'GET') {
      return sseResponse(hub);
    }

    // ------------------------------------------------------------------
    // Time (spec FR-07)
    // ------------------------------------------------------------------
    if (route === '/time' && method === 'GET') {
      const workspaceConfig = await config.load();
      const timezone = workspaceConfig.timezone || 'Asia/Ho_Chi_Minh';
      return ok({ currentDate: getCurrentDateInTimezone(timezone), timezone });
    }

    // ------------------------------------------------------------------
    // Generic file API (spec FR-02)
    // ------------------------------------------------------------------
    if (route === '/fs/read' && method === 'GET') {
      const path = query.get('path') || '';
      const guard = guardPath(path);
      if (guard) return guard;
      if (!(await fs.exists(path))) return notFound(path);
      return ok(await readWorkspaceFile(path));
    }

    if (route === '/fs/list' && method === 'GET') {
      const glob = query.get('glob') || '**/*';
      const files = (await fs.listByGlob(glob)).filter(
        (path) => !isPathForbidden(path) && hasAllowedExtension(path),
      );
      return ok(files);
    }

    if ((route === '/fs/patch' || route === '/fs/write') && method === 'POST') {
      const body = await readJsonBody(request);
      if (!body) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 'Request body must be a JSON object', 400);
      }

      const path = typeof body.path === 'string' ? body.path : '';
      const guard = guardPath(path);
      if (guard) return guard;

      if (route === '/fs/write') {
        if (typeof body.content !== 'string') {
          return fail(ERROR_CODES.VALIDATION_ERROR, "'content' must be a string", 400);
        }
        const frontmatter = body.frontmatter;
        if (frontmatter !== undefined) {
          if (
            typeof frontmatter !== 'object' ||
            frontmatter === null ||
            Array.isArray(frontmatter)
          ) {
            return fail(ERROR_CODES.VALIDATION_ERROR, "'frontmatter' must be an object", 400);
          }
          if (!path.toLowerCase().endsWith('.md')) {
            return fail(
              ERROR_CODES.VALIDATION_ERROR,
              "'frontmatter' is only supported for markdown files",
              400,
            );
          }
        }
        const rawMarkdown = frontmatter !== undefined
          ? stringifyMarkdown(frontmatter, body.content)
          : body.content;
        await fs.writeTextAtomic(path, rawMarkdown);
        return ok(await readWorkspaceFile(path));
      }

      // fs/patch
      const patch = (body.patch ?? {}) as {
        frontmatter?: Record<string, unknown>;
        body?: string;
      };
      if (
        body.patch !== undefined &&
        (typeof patch !== 'object' || patch === null || Array.isArray(patch))
      ) {
        return fail(ERROR_CODES.VALIDATION_ERROR, "'patch' must be an object", 400);
      }
      if (!(await fs.exists(path))) return notFound(path);

      if (patch.frontmatter !== undefined) {
        if (typeof patch.frontmatter !== 'object' || patch.frontmatter === null) {
          return fail(ERROR_CODES.VALIDATION_ERROR, "'patch.frontmatter' must be an object", 400);
        }
        if (!path.toLowerCase().endsWith('.md')) {
          return fail(
            ERROR_CODES.VALIDATION_ERROR,
            "'patch.frontmatter' is only supported for markdown files",
            400,
          );
        }
      }
      if (patch.body !== undefined && typeof patch.body !== 'string') {
        return fail(ERROR_CODES.VALIDATION_ERROR, "'patch.body' must be a string", 400);
      }

      const raw = await fs.readText(path);
      const { frontmatter, body: existingBody } = safeParseMarkdown(raw, path);
      const mergedFrontmatter = { ...frontmatter, ...patch.frontmatter };
      const mergedBody = patch.body !== undefined ? patch.body : existingBody;
      const rawMarkdown = path.toLowerCase().endsWith('.md')
        ? stringifyMarkdown(mergedFrontmatter, mergedBody)
        : mergedBody;
      await fs.writeTextAtomic(path, rawMarkdown);
      return ok(await readWorkspaceFile(path));
    }

    // ------------------------------------------------------------------
    // Debts (spec FR-03/FR-06)
    // ------------------------------------------------------------------
    if (route === '/debts' && method === 'GET') {
      const status = query.get('status') || undefined;
      const direction = query.get('direction') || undefined;
      const personName = query.get('personName') || undefined;
      if (status && !Object.values(DebtStatus).includes(status as DebtStatus)) {
        return fail(ERROR_CODES.VALIDATION_ERROR, `Invalid status: ${status}`, 400);
      }
      if (direction && !Object.values(DebtDirection).includes(direction as DebtDirection)) {
        return fail(ERROR_CODES.VALIDATION_ERROR, `Invalid direction: ${direction}`, 400);
      }
      return ok(
        await debts.filter({
          status: status as DebtStatus | undefined,
          direction: direction as DebtDirection | undefined,
          personName,
        }),
      );
    }

    if (route === '/debts/summary' && method === 'GET') {
      return ok(await debts.getSummary());
    }

    if (route === '/debts/create' && method === 'POST') {
      const body = await readJsonBody(request);
      if (!body) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 'Request body must be a JSON object', 400);
      }
      const { personName, amount, direction, currency, reason, debtDate } = body;
      if (typeof personName !== 'string' || personName.trim() === '') {
        return fail(ERROR_CODES.VALIDATION_ERROR, "'personName' is required", 400);
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return fail(ERROR_CODES.VALIDATION_ERROR, "'amount' must be a positive number", 400);
      }
      if (direction !== DebtDirection.LENT && direction !== DebtDirection.BORROWED) {
        return fail(ERROR_CODES.VALIDATION_ERROR, "'direction' must be 'lent' or 'borrowed'", 400);
      }
      if (currency !== undefined && (typeof currency !== 'string' || currency.trim() === '')) {
        return fail(ERROR_CODES.VALIDATION_ERROR, "'currency' must be a non-empty string", 400);
      }
      if (reason !== undefined && typeof reason !== 'string') {
        return fail(ERROR_CODES.VALIDATION_ERROR, "'reason' must be a string", 400);
      }
      if (typeof debtDate === 'string' && !DATE_PATTERN.test(debtDate)) {
        return fail(ERROR_CODES.VALIDATION_ERROR, "'debtDate' must be YYYY-MM-DD", 400);
      }

      const doc = await debts.create({
        personName: personName.trim(),
        amount,
        direction,
        currency: typeof currency === 'string' ? currency : undefined,
        reason: typeof reason === 'string' ? reason : undefined,
        debtDate: typeof debtDate === 'string' ? debtDate : undefined,
        updatedBy: 'user',
      });
      return created(doc);
    }

    const debtAction = route.match(/^\/debts\/([^/]+)\/(settle|cancel)$/);
    if (debtAction && method === 'POST') {
      const [, debtId, action] = debtAction;
      if (!isValidUUID(debtId)) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 'Invalid debt id', 400);
      }
      const doc = action === 'settle' ? await debts.settle(debtId) : await debts.cancel(debtId);
      if (!doc) return notFound(`Debt ${debtId}`, undefined);
      return ok(doc);
    }

    const debtDelete = route.match(/^\/debts\/([^/]+)$/);
    if (debtDelete && method === 'DELETE') {
      const [, debtId] = debtDelete;
      if (!isValidUUID(debtId)) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 'Invalid debt id', 400);
      }
      const deleted = await debts.delete(debtId);
      if (!deleted) return notFound(`Debt ${debtId}`, undefined);
      return ok(true);
    }

    // ------------------------------------------------------------------
    // Daily work (spec FR-03/FR-07)
    // ------------------------------------------------------------------
    if (route === '/daily/today' && method === 'GET') {
      const workspaceConfig = await config.load();
      const timezone = workspaceConfig.timezone || 'Asia/Ho_Chi_Minh';
      const today = getCurrentDateInTimezone(timezone);
      return ok(await dailyWork.get(today));
    }

    const dailyRoute = route.match(/^\/daily\/([^/]+)$/);
    if (dailyRoute && (method === 'GET' || method === 'POST')) {
      const [, date] = dailyRoute;
      if (!DATE_PATTERN.test(date)) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 'Date must be YYYY-MM-DD', 400);
      }

      if (method === 'GET') {
        return ok(await dailyWork.get(date));
      }

      const body = await readJsonBody(request);
      if (!body) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 'Request body must be a JSON object', 400);
      }
      const payload = parseReportPayload(body);
      if (!payload) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 'Invalid report payload', 400);
      }
      const doc = await dailyWork.save(date, payload.report, {
        customSections: payload.customSections,
        updatedBy: 'user',
      });
      return ok(doc);
    }

    return fail(ERROR_CODES.NOT_FOUND, `Route ${method} ${url.pathname} not found`, 404);
  }

  return {
    async handle(request, info) {
      // Localhost loopback guard (spec NFR-03)
      if (!isLoopback(info)) {
        return accessDenied(undefined);
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      try {
        if (pathname === APPS_BASE || pathname.startsWith(`${APPS_BASE}/`)) {
          if (request.method !== 'GET') {
            return fail(ERROR_CODES.NOT_FOUND, `Method ${request.method} not allowed`, 405);
          }
          return await handleWorkspaceApp(request, pathname);
        }
        if (pathname === workspaceBase || pathname.startsWith(`${workspaceBase}/`)) {
          return await handleApi(request, url);
        }
        return fail(ERROR_CODES.NOT_FOUND, `Route ${request.method} ${pathname} not found`, 404);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return notFound(pathname);
        }
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Workspace router error', { path: pathname, error: message });
        return fail(ERROR_CODES.INTERNAL_ERROR, `Workspace error: ${message}`, 500);
      }
    },
    stop() {
      hub.stop();
    },
  };
}
