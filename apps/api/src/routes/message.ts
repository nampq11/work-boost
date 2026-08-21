import type { AgentPort } from '@work-boost/brain';
import { logger } from '@work-boost/shared/logger/logger.ts';
import {
  ERROR_CODES,
  errorResponse,
  isAIUnavailableError,
  successResponse,
} from '../utils/response.ts';
import { isValidSessionId, sanitizeInput } from '../utils/security.ts';

const AGENT_TIMEOUT_MS = 120_000;
const REDACTED_SESSION_ID = '[redacted]';

interface MessageRequestBody {
  message: string;
  sessionId?: string;
  images?: string[];
  imageData?: string;
  fileData?: unknown;
}

function validateMessageRequest(body: unknown): {
  valid: boolean;
  error?: string;
  data?: MessageRequestBody;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as MessageRequestBody;

  if (!data.message || typeof data.message !== 'string') {
    return { valid: false, error: 'Message is required and must be a string' };
  }

  if (data.message.length < 1 || data.message.length > 5000) {
    return {
      valid: false,
      error: 'Message must be between 1 and 5000 characters',
    };
  }

  if (data.sessionId && !isValidSessionId(data.sessionId)) {
    return { valid: false, error: 'Invalid session ID format' };
  }

  if (data.images && !Array.isArray(data.images)) {
    return { valid: false, error: 'Images must be an array' };
  }

  data.message = sanitizeInput(data.message);

  return { valid: true, data };
}

export async function handleMessage(
  req: Request,
  agent: AgentPort,
  requestId: string,
): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const validation = validateMessageRequest(body);

    if (!validation.valid) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        validation.error || 'Validation failed',
        400,
        undefined,
        requestId,
      );
    }

    const { message, sessionId } = validation.data!;
    const activeSessionId = sessionId || 'default';

    logger.info('Processing async message request', {
      requestId,
      sessionId: sessionId ? REDACTED_SESSION_ID : undefined,
      messageLength: message.length,
    });

    const response = successResponse(
      {
        message: 'Message accepted for processing',
        sessionId: activeSessionId,
        messageId: requestId,
        timestamp: new Date().toISOString(),
      },
      202,
      requestId,
    );

    // Process message asynchronously (don't await)
    agent
      .stream(message, {
        sessionId: activeSessionId,
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      })
      .then(() => {
        logger.info('Async message processing completed', {
          requestId,
          sessionId: REDACTED_SESSION_ID,
        });
      })
      .catch((error) => {
        logger.error('Async message processing failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Async message processing setup failed', { requestId, error: errorMsg });
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      `Message processing setup failed: ${errorMsg}`,
      500,
      undefined,
      requestId,
    );
  }
}

export async function handleMessageSync(
  req: Request,
  agent: AgentPort,
  requestId: string,
): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const validation = validateMessageRequest(body);

    if (!validation.valid) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        validation.error || 'Validation failed',
        400,
        undefined,
        requestId,
      );
    }

    const { message, sessionId } = validation.data!;
    const activeSessionId = sessionId || 'default';

    logger.info('Processing sync message request', {
      requestId,
      sessionId: REDACTED_SESSION_ID,
      messageLength: message.length,
    });

    try {
      const response = await agent.stream(message, {
        sessionId: activeSessionId,
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(AGENT_TIMEOUT_MS)]),
      });

      return successResponse(
        {
          response,
          sessionId: activeSessionId,
          timestamp: new Date().toISOString(),
        },
        200,
        requestId,
      );
    } catch (streamError) {
      logger.error('Agent stream failed', {
        requestId,
        error: streamError instanceof Error ? streamError.name : 'UnknownError',
      });
      if (isAIUnavailableError(streamError)) {
        return errorResponse(
          ERROR_CODES.AI_UNAVAILABLE,
          'The AI provider is unavailable',
          503,
          undefined,
          requestId,
        );
      }
      const errorMsg = streamError instanceof Error ? streamError.message : String(streamError);
      return errorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        `Message processing failed: ${errorMsg}`,
        500,
        undefined,
        requestId,
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Message processing failed', { requestId, error: errorMsg });
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      `Message processing failed: ${errorMsg}`,
      500,
      undefined,
      requestId,
    );
  }
}

export async function handleMessageReset(
  req: Request,
  agent: AgentPort,
  requestId: string,
): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body as { sessionId?: string };

    logger.info('Processing reset request', {
      requestId,
      sessionId: sessionId ? REDACTED_SESSION_ID : 'current',
    });

    if (sessionId) {
      const success = agent.removeSession(sessionId);
      if (!success) {
        return errorResponse(
          ERROR_CODES.SESSION_NOT_FOUND,
          `Session ${sessionId} not found`,
          404,
          undefined,
          requestId,
        );
      }

      return successResponse(
        {
          message: `Session ${sessionId} has been reset`,
          sessionId,
        },
        200,
        requestId,
      );
    }

    agent.removeSession('default');
    return successResponse(
      {
        message: 'Default session has been reset',
        sessionId: 'default',
        timestamp: new Date().toISOString(),
      },
      200,
      requestId,
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Reset operation failed', { requestId, error: errorMsg });
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      `Reset operation failed: ${errorMsg}`,
      500,
      undefined,
      requestId,
    );
  }
}
