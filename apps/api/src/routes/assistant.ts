import type {
  AssistantResponse,
  AssistantService,
  ResponseEvent,
} from '../services/assistant-service.ts';
import { ERROR_CODES, errorResponse, successResponse } from '../utils/response.ts';
import { isValidSessionId, sanitizeInput } from '../utils/security.ts';

function notFound(message: string, requestId: string): Response {
  return errorResponse(ERROR_CODES.NOT_FOUND, message, 404, undefined, requestId);
}

function invalid(message: string, requestId: string): Response {
  return errorResponse(ERROR_CODES.VALIDATION_ERROR, message, 400, undefined, requestId);
}

async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => ({}));
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function isMetadata(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sseFrame(event: ResponseEvent): string {
  const eventName = event.type;
  return `event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`;
}

function responseStream(
  req: Request,
  service: AssistantService,
  response: AssistantResponse,
): Response {
  let unsubscribe: () => void = () => undefined;
  let closed = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        controller.close();
      };
      const send = (event: ResponseEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(sseFrame(event)));
        if (
          event.type === 'response.completed' ||
          event.type === 'response.failed' ||
          event.type === 'response.cancelled'
        ) {
          close();
        }
      };

      unsubscribe = service.subscribeResponse(response.id, send);
      const events = service.getResponseEvents(response.id);
      if (events.length > 0) {
        for (const event of events) send(event);
      } else {
        const fallbackType = fallbackEventType(response.status);
        send({ type: fallbackType, response });
      }
      if (closed) return;
      req.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      closed = true;
      unsubscribe();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

function fallbackEventType(status: AssistantResponse['status']): ResponseEvent['type'] {
  switch (status) {
    case 'completed':
      return 'response.completed';
    case 'failed':
      return 'response.failed';
    case 'cancelled':
      return 'response.cancelled';
    default:
      return 'response.started';
  }
}
function acceptsEventStream(req: Request): boolean {
  return req.headers.get('accept')?.includes('text/event-stream') ?? false;
}

export async function handleAssistantRequest(
  req: Request,
  path: string,
  service: AssistantService,
  requestId: string,
): Promise<Response> {
  await service.waitUntilReady();
  const segments = path.split('/').filter(Boolean);
  const version = segments.shift();
  if (version !== 'v1') {
    return notFound(`Route ${req.method} ${path} not found`, requestId);
  }
  const resource = segments.shift();

  if (!resource) return notFound(`Route ${req.method} ${path} not found`, requestId);

  if (resource === 'threads') {
    if (segments.length === 0) {
      if (req.method === 'POST') {
        const body = await jsonBody(req);
        if (body.title !== undefined && body.title !== null && typeof body.title !== 'string') {
          return invalid('title must be a string or null', requestId);
        }
        if (body.metadata !== undefined && !isMetadata(body.metadata)) {
          return invalid('metadata must be an object', requestId);
        }
        const thread = await service.createThread({
          title: body.title as string | null | undefined,
          metadata: body.metadata as Record<string, unknown> | undefined,
        });
        return successResponse(thread, 201, requestId);
      }
      if (req.method === 'GET') {
        const requestedLimit = Number(new URL(req.url).searchParams.get('limit') ?? '50');
        const limit = Number.isInteger(requestedLimit)
          ? Math.min(Math.max(requestedLimit, 1), 100)
          : 50;
        return successResponse(await service.listThreads(limit), 200, requestId);
      }
      return notFound(`Route ${req.method} ${path} not found`, requestId);
    }

    const threadId = segments[0];
    if (!isValidSessionId(threadId)) return invalid('Invalid thread ID format', requestId);
    const thread = await service.getThread(threadId);
    if (!thread) return notFound(`Thread ${threadId} was not found`, requestId);

    if (segments.length === 1) {
      if (req.method === 'GET') return successResponse(thread, 200, requestId);
      if (req.method === 'PATCH') {
        const body = await jsonBody(req);
        if (body.title !== undefined && body.title !== null && typeof body.title !== 'string') {
          return invalid('title must be a string or null', requestId);
        }
        if (body.metadata !== undefined && !isMetadata(body.metadata)) {
          return invalid('metadata must be an object', requestId);
        }
        const updated = await service.updateThread(threadId, {
          title: body.title as string | null | undefined,
          metadata: body.metadata as Record<string, unknown> | undefined,
        });
        return successResponse(updated, 200, requestId);
      }
      if (req.method === 'DELETE') {
        await service.deleteThread(threadId);
        return new Response(null, { status: 204, headers: { 'X-Request-ID': requestId } });
      }
    }

    if (segments[1] === 'messages' && segments.length === 2 && req.method === 'GET') {
      return successResponse(await service.getMessages(threadId), 200, requestId);
    }

    if (segments[1] === 'responses' && segments.length === 2 && req.method === 'POST') {
      const body = await jsonBody(req);
      const rawInput = typeof body.input === 'string' ? body.input : body.message;
      if (typeof rawInput !== 'string' || !rawInput.trim()) {
        return invalid('input is required and must be a non-empty string', requestId);
      }
      if (rawInput.length > 5000) {
        return invalid('input must not exceed 5000 characters', requestId);
      }
      const response = await service.createResponse(threadId, sanitizeInput(rawInput));
      return successResponse(response, 202, requestId);
    }

    return notFound(`Route ${req.method} ${path} not found`, requestId);
  }

  if (resource === 'responses' && segments.length === 1) {
    const responseId = segments[0];
    if (!isValidSessionId(responseId)) return invalid('Invalid response ID format', requestId);
    const response = await service.getResponse(responseId);
    if (!response) return notFound(`Response ${responseId} was not found`, requestId);
    if (req.method === 'GET') {
      return acceptsEventStream(req)
        ? responseStream(req, service, response)
        : successResponse(response, 200, requestId);
    }
    return notFound(`Route ${req.method} ${path} not found`, requestId);
  }

  if (
    resource === 'responses' &&
    segments.length === 2 &&
    segments[1] === 'cancel' &&
    req.method === 'POST'
  ) {
    const responseId = segments[0];
    if (!isValidSessionId(responseId)) return invalid('Invalid response ID format', requestId);
    const response = await service.cancelResponse(responseId);
    return response
      ? successResponse(response, 200, requestId)
      : notFound(`Response ${responseId} was not found`, requestId);
  }

  return notFound(`Route ${req.method} ${path} not found`, requestId);
}
