import {
  type AIConfigPort,
  type AuthLoginEvent,
  type AuthPort,
  AuthServiceError,
} from '@work-boost/brain';
import { ERROR_CODES, errorResponse, successResponse } from '../utils/response.ts';

const LOGIN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function authErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AuthServiceError) {
    const authError = error;
    return errorResponse(authError.code, authError.message, authError.status, undefined, requestId);
  }
  return errorResponse(
    ERROR_CODES.AUTH_SERVICE_UNAVAILABLE,
    'The authentication service is unavailable',
    503,
    undefined,
    requestId,
  );
}

function aiConfigErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AuthServiceError) return authErrorResponse(error, requestId);
  // Validation failures arrive as AuthServiceError above; anything else
  // (config load/save IO) is a server fault, not user-correctable input.
  return errorResponse(
    ERROR_CODES.INTERNAL_ERROR,
    'Failed to update the AI configuration',
    500,
    undefined,
    requestId,
  );
}

function isValidLoginId(loginId: string): boolean {
  return LOGIN_ID_PATTERN.test(loginId);
}

export async function handleAuthStatus(auth: AuthPort, requestId: string): Promise<Response> {
  try {
    return noStore(successResponse(await auth.getStatus(), 200, requestId));
  } catch (error) {
    return noStore(authErrorResponse(error, requestId));
  }
}

export async function handleAuthLogin(
  req: Request,
  auth: AuthPort,
  requestId: string,
): Promise<Response> {
  try {
    const body = await req.json().catch(() => undefined);
    if (!body || typeof body !== 'object') {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'Request body is required',
          400,
          undefined,
          requestId,
        ),
      );
    }
    const data = body as { provider?: unknown; type?: unknown; reauthenticate?: unknown };
    if (
      typeof data.provider !== 'string' ||
      data.provider.length === 0 ||
      data.type !== 'oauth' ||
      (data.reauthenticate !== undefined && typeof data.reauthenticate !== 'boolean')
    ) {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'provider, type=oauth, and an optional boolean reauthenticate are required',
          400,
          undefined,
          requestId,
        ),
      );
    }

    const session = await auth.startLogin({
      provider: data.provider,
      type: 'oauth',
      reauthenticate: data.reauthenticate as boolean | undefined,
    });
    return noStore(successResponse(session, 202, requestId));
  } catch (error) {
    return noStore(authErrorResponse(error, requestId));
  }
}

function eventFrame(event: AuthLoginEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function handleAuthLoginEvents(
  req: Request,
  auth: AuthPort,
  loginId: string,
  requestId: string,
): Response {
  if (!isValidLoginId(loginId) || !auth.hasLogin(loginId)) {
    return noStore(
      errorResponse(
        ERROR_CODES.AUTH_LOGIN_NOT_FOUND,
        'Login session was not found',
        404,
        undefined,
        requestId,
      ),
    );
  }

  let unsubscribe: () => void = () => undefined;
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const close = () => {
        if (closed) return;
        closed = true;
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        unsubscribe();
        controller.close();
      };
      unsubscribe = auth.subscribe(loginId, (event) => {
        if (closed) return;
        controller.enqueue(encoder.encode(eventFrame(event)));
        if (event.type === 'completed' || event.type === 'failed' || event.type === 'cancelled') {
          close();
        }
      });
      if (!closed) {
        keepAliveTimer = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(':\n\n'));
        }, 15_000);
      }
      req.signal.addEventListener(
        'abort',
        () => {
          if (closed) return;
          closed = true;
          if (keepAliveTimer) clearInterval(keepAliveTimer);
          unsubscribe();
          auth.disconnect(loginId);
          controller.close();
        },
        { once: true },
      );
    },
    cancel() {
      if (closed) return;
      closed = true;
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      unsubscribe();
      auth.disconnect(loginId);
    },
  });

  const response = new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'X-Request-ID': requestId,
    },
  });
  return response;
}

export async function handleAuthLoginCancel(
  auth: AuthPort,
  loginId: string,
  requestId: string,
): Promise<Response> {
  if (!isValidLoginId(loginId)) {
    return noStore(
      errorResponse(
        ERROR_CODES.AUTH_LOGIN_NOT_FOUND,
        'Login session was not found',
        404,
        undefined,
        requestId,
      ),
    );
  }
  try {
    return noStore(successResponse(await auth.cancelLogin(loginId), 200, requestId));
  } catch (error) {
    return noStore(authErrorResponse(error, requestId));
  }
}

export async function handleAuthLoginCode(
  req: Request,
  auth: AuthPort,
  loginId: string,
  requestId: string,
): Promise<Response> {
  if (!isValidLoginId(loginId)) {
    return noStore(
      errorResponse(
        ERROR_CODES.AUTH_LOGIN_NOT_FOUND,
        'Login session was not found',
        404,
        undefined,
        requestId,
      ),
    );
  }
  try {
    const body = await req.json().catch(() => undefined);
    if (!body || typeof body !== 'object') {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'Request body is required',
          400,
          undefined,
          requestId,
        ),
      );
    }
    const { code } = body as { code?: unknown };
    if (typeof code !== 'string' || code.trim().length === 0) {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'code must be a non-empty string',
          400,
          undefined,
          requestId,
        ),
      );
    }
    await auth.submitLoginCode(loginId, code);
    return noStore(successResponse({ submitted: true }, 200, requestId));
  } catch (error) {
    return noStore(authErrorResponse(error, requestId));
  }
}

export async function handleAuthLogout(auth: AuthPort, requestId: string): Promise<Response> {
  try {
    return noStore(successResponse(await auth.logout(), 200, requestId));
  } catch (error) {
    return noStore(authErrorResponse(error, requestId));
  }
}

export async function handleAuthApiKey(
  auth: AuthPort,
  req: Request,
  requestId: string,
): Promise<Response> {
  try {
    const body = await req.json().catch(() => undefined);
    if (!body || typeof body !== 'object') {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'Request body is required',
          400,
          undefined,
          requestId,
        ),
      );
    }
    const { provider, apiKey } = body as { provider?: unknown; apiKey?: unknown };
    if (typeof provider !== 'string' || provider.length === 0) {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'provider is required',
          400,
          undefined,
          requestId,
        ),
      );
    }
    if (typeof apiKey !== 'string') {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'apiKey must be a string',
          400,
          undefined,
          requestId,
        ),
      );
    }
    await auth.saveApiKey(provider, apiKey);
    return noStore(successResponse(await auth.getStatus(), 200, requestId));
  } catch (error) {
    return noStore(authErrorResponse(error, requestId));
  }
}

export async function handleAuthConfig(
  aiConfig: AIConfigPort,
  req: Request,
  requestId: string,
): Promise<Response> {
  try {
    const body = await req.json().catch(() => undefined);
    if (!body || typeof body !== 'object') {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'Request body is required',
          400,
          undefined,
          requestId,
        ),
      );
    }
    const { provider, model } = body as { provider?: unknown; model?: unknown };
    if (typeof provider !== 'string' || provider.length === 0) {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'provider is required',
          400,
          undefined,
          requestId,
        ),
      );
    }
    if (model !== undefined && typeof model !== 'string') {
      return noStore(
        errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'model must be a string',
          400,
          undefined,
          requestId,
        ),
      );
    }
    return noStore(
      successResponse(await aiConfig.setAIConfig({ provider, model }), 200, requestId),
    );
  } catch (error) {
    return noStore(aiConfigErrorResponse(error, requestId));
  }
}
