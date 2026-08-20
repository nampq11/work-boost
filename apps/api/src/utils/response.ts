// Standard API response structure
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
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
  message: unknown,
  statusCode: number = 500,
  details?: unknown,
  requestId?: string,
): Response {
  // Sanitize error message and details to ensure they're serializable
  let sanitizedMessage = typeof message === 'string' ? message : '';
  let sanitizedDetails = details;

  // Ensure message is always a string
  if (typeof message !== 'string') {
    try {
      sanitizedMessage = message instanceof Error ? message.message : String(message);
    } catch {
      sanitizedMessage = 'Unknown error occurred';
    }
  }

  // Sanitize details to prevent circular references and [object Object] display
  if (details !== undefined && details !== null) {
    try {
      if (details instanceof Error) {
        // Stack traces stay in server logs; only stable fields are exposed to clients
        sanitizedDetails = {
          message: details.message,
          name: details.name,
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

  const response: ApiResponse<unknown> = {
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
  FORBIDDEN: 'FORBIDDEN',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
