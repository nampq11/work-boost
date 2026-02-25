import { logger } from '../../core/logger/logger.ts';
import type { Agent, Database } from '../../core/services/index.ts';
import type { Slack } from '../../core/services/slack/slack.ts';
import type { TelegramService } from '../../core/services/telegram/telegram.ts';
import {
  createRequestContext,
  logError,
  logRequest,
  logResponse,
  type RequestContext,
} from './middleware/logging.ts';
import { validateSlackWebhook } from './middleware/slack-validation.ts';
import { handleMessage, handleMessageReset, handleMessageSync } from './routes/message.ts';
import {
  handleSlackMessages,
  handleSlackSubscribe,
  handleSlackUnsubscribe,
  type SlackDeps,
} from './routes/slack.ts';
import { ERROR_CODES, errorResponse, successResponse } from './utils/response.ts';

// ============================================================================
// Configuration
// ============================================================================

export interface ApiServerConfig {
  port: number;
  host?: string;
  corsOrigins?: string[];
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  enableWebSocket?: boolean;
  apiPrefix?: string;
  slack?: Slack;
  telegram?: TelegramService;
  db?: Database;
  agent?: Agent;
}

// ============================================================================
// CORS Helpers
// ============================================================================

function addCorsHeaders(request: Request, response: Response, corsOrigins?: string[]): Response {
  const origin = request.headers.get('origin');
  const headers = new Headers(response.headers);

  // Check allowed origins
  let allowOrigin = '*';
  if (origin) {
    const allowed = corsOrigins || ['http://localhost:3000'];
    if (allowed.includes(origin)) {
      allowOrigin = origin;
    } else {
      // Allow localhost in development
      try {
        const originUrl = new URL(origin);
        if (
          originUrl.hostname === 'localhost' ||
          originUrl.hostname === '127.0.0.1' ||
          originUrl.hostname === '::1'
        ) {
          allowOrigin = origin;
        }
      } catch {
        // Invalid origin URL, use default
      }
    }
  }

  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Request-ID, X-Session-ID',
  );
  headers.set('Access-Control-Allow-Credentials', 'true');

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

export function createServer(config: ApiServerConfig) {
  const apiPrefix = validateAndNormalizeApiPrefix(config.apiPrefix);
  const corsOrigins = config.corsOrigins;
  const slackSigningSecret = Deno.env.get('SLACK_SIGNING_SECRET') || '';

  // Rate limiter for API routes
  const checkRateLimit = createRateLimiter(
    config.rateLimitWindowMs || 15 * 60 * 1000,
    config.rateLimitMaxRequests || 100,
  );

  // Build Slack deps if available
  const slackDeps: SlackDeps | undefined =
    config.db && config.agent && config.slack
      ? { db: config.db, agent: config.agent, slack: config.slack }
      : undefined;

  function buildApiPath(route: string): string {
    if (!apiPrefix || apiPrefix === '') return route;
    return apiPrefix + route;
  }

  async function handleRequest(req: Request): Promise<Response> {
    const ctx: RequestContext = createRequestContext();
    logRequest(req, ctx);

    try {
      // Handle CORS preflight
      const corsResponse = handleOptionsRequest(req, corsOrigins);
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
            await config.db.kv?.get(['health']);
            healthData.database = 'connected';
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
      // Slack Bot Routes (with webhook validation)
      // ==============================================================
      if (
        slackDeps &&
        (pathname === '/subscribe' || pathname === '/unsubscribe' || pathname === '/messages')
      ) {
        if (method !== 'POST') {
          const response = errorResponse(
            ERROR_CODES.NOT_FOUND,
            `Method ${method} not allowed`,
            405,
          );
          logResponse(req, response, ctx);
          return response;
        }

        // Validate Slack webhook signature
        const { error: validationError, bodyString } = await validateSlackWebhook(
          req,
          slackSigningSecret,
          ctx.requestId,
        );
        if (validationError) {
          logResponse(req, validationError, ctx);
          return validationError;
        }

        // Parse the validated body
        let parsedBody: Record<string, string>;
        try {
          // Slack sends URL-encoded form data
          const params = new URLSearchParams(bodyString);
          parsedBody = Object.fromEntries(params as unknown as Iterable<[string, string]>);
        } catch {
          try {
            parsedBody = JSON.parse(bodyString);
          } catch {
            const response = new Response('Invalid request body', { status: 400 });
            logResponse(req, response, ctx);
            return response;
          }
        }

        let response: Response;
        if (pathname === '/subscribe') {
          response = await handleSlackSubscribe(parsedBody, slackDeps);
        } else if (pathname === '/unsubscribe') {
          response = await handleSlackUnsubscribe(parsedBody, slackDeps);
        } else {
          response = await handleSlackMessages(parsedBody, slackDeps);
        }

        logResponse(req, response, ctx);
        return response;
      }

      // ==============================================================
      // Telegram Webhook
      // ==============================================================
      if (pathname.startsWith('/telegram') && config.telegram) {
        if (!(await config.telegram.validateWebhook(req))) {
          const response = new Response('Unauthorized', { status: 401 });
          logResponse(req, response, ctx);
          return response;
        }
        const response = await config.telegram.handleWebhook(req);
        logResponse(req, response, ctx);
        return response;
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
    start(): void {
      const host = config.host || '0.0.0.0';
      const port = config.port;

      Deno.serve(
        {
          hostname: host,
          port,
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
  };
}
