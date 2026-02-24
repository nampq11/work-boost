import { logger } from '../../../core/logger/logger.ts';

/**
 * Request context for logging
 */
export interface RequestContext {
  requestId: string;
  startTime: number;
}

/**
 * Create a request context with a unique ID and start time
 */
export function createRequestContext(): RequestContext {
  return {
    requestId: crypto.randomUUID(),
    startTime: Date.now(),
  };
}

/**
 * Log an incoming request
 */
export function logRequest(req: Request, ctx: RequestContext): void {
  const url = new URL(req.url);
  logger.info(`API Request`, {
    requestId: ctx.requestId,
    method: req.method,
    url: url.pathname,
    userAgent: req.headers.get('user-agent') || 'Unknown',
    contentType: req.headers.get('content-type'),
  });
}

/**
 * Log a response after handling
 */
export function logResponse(req: Request, response: Response, ctx: RequestContext): void {
  const url = new URL(req.url);
  const duration = Date.now() - ctx.startTime;

  logger.info(`API Response`, {
    requestId: ctx.requestId,
    method: req.method,
    url: url.pathname,
    statusCode: response.status,
    duration: `${duration}ms`,
  });
}

/**
 * Log an error during request handling
 */
export function logError(req: Request, error: unknown, ctx: RequestContext): void {
  const url = new URL(req.url);
  logger.error('API Error', {
    requestId: ctx.requestId,
    method: req.method,
    url: url.pathname,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    userAgent: req.headers.get('user-agent'),
  });
}

/**
 * Wrapper that adds logging, request ID, and error handling around a request handler
 */
export function withLogging(
  handler: (req: Request, ctx: RequestContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const ctx = createRequestContext();
    logRequest(req, ctx);

    try {
      const response = await handler(req, ctx);
      logResponse(req, response, ctx);
      return response;
    } catch (error) {
      logError(req, error, ctx);
      throw error;
    }
  };
}
