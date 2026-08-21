/// <reference lib="deno.ns" />

import type { AgentPort, AuthPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { ExtensionManager } from '../../../extensions/manager.ts';
import {
  type RequestContext,
  createRequestContext,
  logError,
  logRequest,
  logResponse,
} from './middleware/logging.ts';
import {
  handleAuthLogin,
  handleAuthLoginCancel,
  handleAuthLoginEvents,
  handleAuthLogout,
  handleAuthStatus,
} from './routes/auth.ts';
import { handleMessage, handleMessageReset, handleMessageSync } from './routes/message.ts';
import { type WorkspaceRouter, createWorkspaceRouter } from './routes/workspace.ts';
import { ERROR_CODES, errorResponse, successResponse } from './utils/response.ts';

// ============================================================================
// Configuration
// ============================================================================

const APPS_BASE = '/workspace-apps';

export interface ApiServerConfig {
  port: number;
  host?: string;
  corsOrigins?: string[];
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  enableWebSocket?: boolean;
  apiPrefix?: string;
  db?: Database;
  agent?: AgentPort;
  auth?: AuthPort;
  extensionManager?: ExtensionManager;
}

// ============================================================================
// CORS Helpers
// ============================================================================

export function addCorsHeaders(
  request: Request,
  response: Response,
  corsOrigins?: string[],
): Response {
  const origin = request.headers.get('origin');
  const headers = new Headers(response.headers);
  const vary = new Set(
    (headers.get('Vary') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  vary.add('Origin');
  headers.set('Vary', [...vary].join(', '));

  const allowed = corsOrigins || ['http://localhost:3000'];
  let allowOrigin: string | undefined;
  if (origin && allowed.includes(origin)) {
    allowOrigin = origin;
  } else if (origin) {
    try {
      const originUrl = new URL(origin);
      if (
        originUrl.protocol === 'http:' &&
        (originUrl.hostname === 'localhost' ||
          originUrl.hostname === '127.0.0.1' ||
          originUrl.hostname === '::1' ||
          originUrl.hostname === '[::1]')
      ) {
        allowOrigin = origin;
      }
    } catch {
      // Invalid origins are never granted CORS access.
    }
  }

  if (allowOrigin) {
    headers.set('Access-Control-Allow-Origin', allowOrigin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  } else {
    headers.delete('Access-Control-Allow-Origin');
    headers.delete('Access-Control-Allow-Credentials');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Request-ID, X-Session-ID',
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function handleOptionsRequest(request: Request, corsOrigins?: string[]): Response | null {
  if (request.method === 'OPTIONS') {
    const response = new Response(null, { status: 204 });
    return addCorsHeaders(request, response, corsOrigins);
  }
  return null;
}

// ============================================================================
// Security Headers (replaces helmet)
// ============================================================================

function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '0');
  headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  headers.set('X-Download-Options', 'noopen');
  headers.set('X-DNS-Prefetch-Control', 'off');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Referrer-Policy', 'no-referrer');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ============================================================================
// Rate Limiting (in-memory token bucket per IP)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function createRateLimiter(windowMs: number, maxRequests: number) {
  const entries = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (now > entry.resetAt) {
        entries.delete(key);
      }
    }
  }, windowMs);

  return function checkRateLimit(request: Request): Response | null {
    // Extract client IP from headers or connection info
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const now = Date.now();
    let entry = entries.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(ip, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      return errorResponse(
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        'Too many requests from this IP, please try again later.',
        429,
      );
    }

    return null;
  };
}

// ============================================================================
// Server
// ============================================================================

function validateAndNormalizeApiPrefix(prefix?: string): string {
  if (prefix === undefined) return '/api';
  if (prefix === '') return '';
  if (typeof prefix !== 'string') throw new Error('API prefix must be a string');

  // Remove trailing slash
  if (prefix.endsWith('/') && prefix !== '/') {
    prefix = prefix.slice(0, -1);
  }

  logger.info('[API Server] Using API prefix: ' + (prefix || '(None)'));
  return prefix;
}

function isCancellationError(error: unknown): boolean {
  return (
    error instanceof Deno.errors.Interrupted ||
    (error instanceof Error &&
      (error.name === 'AbortError' ||
        /operation canceled|request has been cancelled/i.test(error.message)))
  );
}

export function createServer(config: ApiServerConfig) {
  const apiPrefix = validateAndNormalizeApiPrefix(config.apiPrefix);
  const corsOrigins = config.corsOrigins;
  const workspaceCorsOrigins = [...(corsOrigins ?? ['http://localhost:3000']), 'null'];
  // Rate limiter for API routes
  const checkRateLimit = createRateLimiter(
    config.rateLimitWindowMs || 15 * 60 * 1000,
    config.rateLimitMaxRequests || 100,
  );

  // Workspace HTML-apps + broker API router (spec Phase 3)
  const workspaceRouter: WorkspaceRouter | undefined = config.db
    ? createWorkspaceRouter({ dataLayer: config.db.dataLayer, apiPrefix })
    : undefined;

  let httpServer: Deno.HttpServer | undefined;

  function buildApiPath(route: string): string {
    if (!apiPrefix || apiPrefix === '') return route;
    return apiPrefix + route;
  }

  async function handleRequest(req: Request, info?: Deno.ServeHandlerInfo): Promise<Response> {
    const ctx: RequestContext = createRequestContext();
    logRequest(req, ctx);

    try {
      // Handle CORS preflight
      const corsResponse = handleOptionsRequest(req, workspaceCorsOrigins);
      if (corsResponse) return corsResponse;

      const url = new URL(req.url);
      const pathname = url.pathname;
      const method = req.method;

      logger.debug(`[${ctx.requestId}] ${method} ${pathname}`);

      // ==============================================================
      // Health Check
      // ==============================================================
      if (pathname === '/' && method === 'GET') {
        const healthData: {
          status: string;
          timestamp: string;
          version: string;
          database?: string;
        } = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: Deno.env.get('VERSION') || 'unknown',
        };

        // Check database health if available
        if (config.db) {
          try {
            const isHealthy = await config.db.healthCheck();
            healthData.database = isHealthy ? 'connected' : 'error';
          } catch {
            healthData.database = 'error';
          }
        }

        const response = successResponse(healthData);
        logResponse(req, response, ctx);
        return addSecurityHeaders(response);
      }

      // ==============================================================
      // Chrome DevTools compatibility
      // ==============================================================
      if (pathname === '/.well-known/appspecific/com.chrome.devtools.json' && method === 'GET') {
        return new Response(null, { status: 204 });
      }

      // ==============================================================
      // Test endpoint
      // ==============================================================
      if (pathname === '/test' && method === 'GET') {
        return new Response('OK', { status: 200 });
      }

      // Extension routes run before the built-in REST API.
      if (config.extensionManager) {
        const extensionResponse = await config.extensionManager.handleRequest(req);
        if (extensionResponse) {
          logResponse(req, extensionResponse, ctx);
          return extensionResponse;
        }
      }

      // ==============================================================
      // Workspace HTML Apps & Broker API (localhost-only, no rate limit)
      // ==============================================================
      const workspaceBase = buildApiPath('/workspace');
      if (
        workspaceRouter &&
        (pathname.startsWith(`${APPS_BASE}/`) ||
          pathname === workspaceBase ||
          pathname.startsWith(`${workspaceBase}/`))
      ) {
        const response = await workspaceRouter.handle(req, info);
        logResponse(req, response, ctx);
        // The shell is served separately from the API during development. Keep
        // workspace JSON and SSE responses usable from that browser origin.
        return addCorsHeaders(req, response, workspaceCorsOrigins);
      }

      // ==============================================================
      // Authentication routes (with rate limiting)
      // ==============================================================
      const authBase = buildApiPath('/auth');
      if (pathname === authBase || pathname.startsWith(`${authBase}/`)) {
        const rateLimitResponse = checkRateLimit(req);
        if (rateLimitResponse) {
          logResponse(req, rateLimitResponse, ctx);
          return addCorsHeaders(req, addSecurityHeaders(rateLimitResponse), corsOrigins);
        }
        if (!config.auth) {
          const response = errorResponse(
            ERROR_CODES.AUTH_SERVICE_UNAVAILABLE,
            'Authentication service is unavailable',
            503,
            undefined,
            ctx.requestId,
          );
          return addCorsHeaders(req, addSecurityHeaders(response), corsOrigins);
        }

        let response: Response;
        const loginPathPrefix = `${authBase}/login/`;
        const loginEventsMatch =
          pathname.startsWith(loginPathPrefix) && pathname.endsWith('/events')
            ? pathname.slice(loginPathPrefix.length, -'/events'.length)
            : undefined;
        const loginCancelMatch =
          pathname.startsWith(loginPathPrefix) && pathname.endsWith('/cancel')
            ? pathname.slice(loginPathPrefix.length, -'/cancel'.length)
            : undefined;

        if (pathname === `${authBase}/status` && method === 'GET') {
          response = await handleAuthStatus(config.auth, ctx.requestId);
        } else if (pathname === `${authBase}/login` && method === 'POST') {
          response = await handleAuthLogin(req, config.auth, ctx.requestId);
        } else if (loginEventsMatch !== undefined && method === 'GET') {
          response = handleAuthLoginEvents(req, config.auth, loginEventsMatch, ctx.requestId);
        } else if (loginCancelMatch !== undefined && method === 'POST') {
          response = await handleAuthLoginCancel(config.auth, loginCancelMatch, ctx.requestId);
        } else if (pathname === `${authBase}/logout` && method === 'POST') {
          response = await handleAuthLogout(config.auth, ctx.requestId);
        } else {
          response = errorResponse(
            ERROR_CODES.NOT_FOUND,
            `Route ${method} ${pathname} not found`,
            404,
            undefined,
            ctx.requestId,
          );
        }
        logResponse(req, response, ctx);
        return addCorsHeaders(req, addSecurityHeaders(response), corsOrigins);
      }

      // ==============================================================
      // API Routes (with rate limiting)
      // ==============================================================
      if (pathname.startsWith(buildApiPath('/message'))) {
        // Apply rate limiting to API routes
        const rateLimitResponse = checkRateLimit(req);
        if (rateLimitResponse) {
          logResponse(req, rateLimitResponse, ctx);
          return rateLimitResponse;
        }

        if (!config.agent) {
          const response = errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Agent not configured', 500);
          logResponse(req, response, ctx);
          return addCorsHeaders(req, addSecurityHeaders(response), corsOrigins);
        }

        let response: Response;

        if (pathname === buildApiPath('/message') && method === 'POST') {
          response = await handleMessage(req, config.agent, ctx.requestId);
        } else if (pathname === buildApiPath('/message/sync') && method === 'POST') {
          response = await handleMessageSync(req, config.agent, ctx.requestId);
        } else if (pathname === buildApiPath('/message/reset') && method === 'POST') {
          response = await handleMessageReset(req, config.agent, ctx.requestId);
        } else {
          response = errorResponse(
            ERROR_CODES.NOT_FOUND,
            `Route ${method} ${pathname} not found`,
            404,
            undefined,
            ctx.requestId,
          );
        }

        logResponse(req, response, ctx);
        return addCorsHeaders(req, addSecurityHeaders(response), corsOrigins);
      }

      // ==============================================================
      // 404 Not Found
      // ==============================================================
      const response = errorResponse(
        ERROR_CODES.NOT_FOUND,
        `Route ${method} ${pathname} not found`,
        404,
        undefined,
        ctx.requestId,
      );
      logResponse(req, response, ctx);
      return addSecurityHeaders(response);
    } catch (error) {
      if (isCancellationError(error)) return new Response(null, { status: 499 });
      logError(req, error, ctx);

      const errorMsg = error instanceof Error ? error.message : String(error);
      const response = errorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        `An unexpected error occurred: ${errorMsg}`,
        500,
        undefined,
        ctx.requestId,
      );
      return addSecurityHeaders(response);
    }
  }

  return {
    handleRequest,
    async start(): Promise<void> {
      const host = config.host || '0.0.0.0';
      const port = config.port;

      httpServer = await Deno.serve(
        {
          hostname: host,
          port,
          onError(error) {
            if (isCancellationError(error)) return new Response(null, { status: 499 });
            logger.error('Unhandled HTTP request error', {
              error: error instanceof Error ? error.message : String(error),
            });
            return addSecurityHeaders(
              errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Internal server error', 500),
            );
          },
          onListen({ hostname, port }) {
            logger.info(
              `API Server started on ${hostname}:${port}${apiPrefix}`,
              undefined,
              'green',
            );
          },
        },
        handleRequest,
      );
    },
    async stop(): Promise<void> {
      workspaceRouter?.stop();
      try {
        await httpServer?.shutdown();
      } catch (error) {
        if (!isCancellationError(error)) throw error;
      }
      await config.extensionManager?.disposeAll();
      config.auth?.dispose?.();
    },
  };
}
