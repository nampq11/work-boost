import { logger } from '../../../core/logger/logger.ts';
import { ERROR_CODES, errorResponse, successResponse } from '../utils/response.ts';
import { isValidSessionId, sanitizeInput } from '../utils/security.ts';

// ============================================================================
// Types
// ============================================================================

interface MessageRequestBody {
  message: string;
  sessionId?: string;
  images?: string[];
  imageData?: string;
  fileData?: unknown;
}

// ============================================================================
// Validation
// ============================================================================

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

  // Sanitize message input
  data.message = sanitizeInput(data.message);

  return { valid: true, data };
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Process message asynchronously without blocking the response
 */
async function processMessageAsync(
  agent: any,
  message: string,
  options: { sessionId?: string; images?: string[]; imageData?: string; fileData?: any },
  requestId?: string,
): Promise<void> {
  try {
    // If sessionId is provided, ensure that session is loaded
    if (options.sessionId) {
      try {
        await agent.loadSession(options.sessionId);
      } catch {
        await agent.createSession(options.sessionId);
      }
    }

    // Convert image data into expected format
    let imageData: { image: string; mimeType: string } | undefined;
    if (options.images && options.images.length > 0 && options.images[0]) {
      imageData = {
        image: options.images[0],
        mimeType: 'image/jpeg',
      };
    } else if (options.imageData && typeof options.imageData === 'string') {
      imageData = {
        image: options.imageData,
        mimeType: 'image/jpeg',
      };
    }

    // Processing the message through the agent using stream
    await agent.stream(
      message,
      async (_chunk) => {
        // Process asynchronously
      },
      { sessionId: options.sessionId, platform: 'api', chatId: requestId },
    );

    logger.info('Async message processing completed', {
      requestId,
      sessionId: options.sessionId || agent.getCurrentSessionId(),
    });
  } catch (error) {
    logger.error('Async message processing failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * POST /message — Process a message asynchronously, returns 202 immediately
 */
export async function handleMessage(
  req: Request,
  agent: any,
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

    const { message, sessionId, images, imageData, fileData } = validation.data!;

    logger.info('Processing async message request', {
      requestId,
      sessionId,
      hasImages: Boolean(images && images.length > 0),
      hasImageData: Boolean(imageData),
      hasFileData: Boolean(fileData),
      messageLength: message.length,
    });

    // Return 202 immediately for async processing
    const response = successResponse(
      {
        message: 'Message accepted for processing',
        sessionId: sessionId || agent.getCurrentSessionId(),
        messageId: requestId,
        timestamp: new Date().toISOString(),
      },
      202,
      requestId,
    );

    // Process message asynchronously (don't await)
    processMessageAsync(
      agent,
      message,
      { sessionId, images, imageData, fileData },
      requestId,
    ).catch((error) => {
      logger.error('Async message processing failed', { requestId, error });
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

/**
 * POST /message/sync — Process a message synchronously and return the full response
 */
export async function handleMessageSync(
  req: Request,
  agent: any,
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

    const { message, sessionId, images } = validation.data!;

    logger.info('Processing sync message request', {
      requestId,
      sessionId: sessionId || 'default',
      hasImages: Boolean(images && images.length > 0),
      messageLength: message.length,
    });

    // If sessionId is provided, ensure that session is loaded
    if (sessionId) {
      try {
        await agent.loadSession(sessionId);
      } catch {
        try {
          await agent.createSession(sessionId);
        } catch (createError) {
          return errorResponse(
            ERROR_CODES.SESSION_NOT_FOUND,
            `Failed to create session: ${
              createError instanceof Error ? createError.message : String(createError)
            }`,
            400,
            undefined,
            requestId,
          );
        }
      }
    }

    // Use stream method which returns accumulated content
    const result = await agent.stream(
      message,
      async (_chunk) => {
        // Accumulate chunks for final response
      },
      { sessionId, platform: 'api', chatId: requestId },
    );

    return successResponse(
      {
        response: result.success ? result.content : 'Failed to process message',
        sessionId: sessionId || 'default',
        timestamp: new Date().toISOString(),
      },
      200,
      requestId,
    );
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

/**
 * POST /message/reset — Reset conversation state for the current or specific session
 */
export async function handleMessageReset(
  req: Request,
  agent: any,
  requestId: string,
): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body as { sessionId?: string };

    logger.info('Processing reset request', {
      requestId,
      sessionId: sessionId || 'current',
    });

    if (sessionId) {
      // Reset specific session
      const success = await agent.removeSession(sessionId);
      if (!success) {
        return errorResponse(
          ERROR_CODES.SESSION_NOT_FOUND,
          `Session ${sessionId} not found`,
          404,
          undefined,
          requestId,
        );
      }

      // Create new session with the same id
      const newSession = await agent.createSession(sessionId);

      return successResponse(
        {
          message: `Session ${sessionId} has been reset`,
          sessionId: newSession.id,
        },
        200,
        requestId,
      );
    } else {
      // Reset current session
      const currentSessionId = agent.getCurrentSessionId();

      if (currentSessionId) {
        await agent.removeSession(currentSessionId);
      }

      // Create a new session
      const newSession = await agent.createSession();

      return successResponse(
        {
          message: 'Current session has been reset',
          sessionId: newSession.id,
          timestamp: new Date().toISOString(),
        },
        200,
        requestId,
      );
    }
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
