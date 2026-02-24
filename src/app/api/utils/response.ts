// Standard API response structure
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

// Success response helper
export function successResponse<T>(
  data: T,
  statusCode: number = 200,
  requestId?: string,
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
    },
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: {
      'content-type': 'application/json',
      ...(requestId && { 'X-Request-ID': requestId }),
    },
  });
}

// Enhanced error response helper to prevent [object Object] display
export function errorResponse(
  code: string,
  message: string,
  statusCode: number = 500,
  details?: any,
  requestId?: string,
): Response {
  // Sanitize error message and details to ensure they're serializable
  let sanitizedMessage = message;
  let sanitizedDetails = details;

  // Ensure message is always a string
  if (typeof message !== 'string') {
    try {
      sanitizedMessage =
        (message as any) instanceof Error ? (message as Error).message : String(message);
    } catch {
      sanitizedMessage = 'Unknown error occurred';
    }
  }

  // Sanitize details to prevent circular references and [object Object] display
  if (details !== undefined && details !== null) {
    try {
      if (details instanceof Error) {
        sanitizedDetails = {
          message: details.message,
          name: details.name,
          ...(details.stack && { stack: details.stack.split('\n').slice(0, 3).join('\n') }),
        };
      } else if (typeof details === 'object') {
        sanitizedDetails = JSON.parse(
          JSON.stringify(details, (_key, value) => {
            if (typeof value === 'function') return '[Function]';
            if (typeof value === 'symbol') return '[Symbol]';
            if (value instanceof Error) return { message: value.message, name: value.name };
            return value;
          }),
        );
      } else {
        sanitizedDetails = String(details);
      }
    } catch {
      sanitizedDetails = { message: String(details), serializationError: true };
    }
  }

  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message: sanitizedMessage,
      ...(sanitizedDetails !== undefined && { details: sanitizedDetails }),
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
    },
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: {
      'content-type': 'application/json',
      ...(requestId && { 'X-Request-ID': requestId }),
    },
  });
}

export const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
