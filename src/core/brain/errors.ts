/**
 * Brain Error Types
 *
 * Standardized error types for consistent error handling
 * across capabilities and tools.
 */

/**
 * Error codes for programmatic error handling
 */
export enum ErrorCode {
  // LLM errors
  LLM_API_ERROR = 'LLM_API_ERROR',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  LLM_RATE_LIMITED = 'LLM_RATE_LIMITED',
  LLM_INVALID_RESPONSE = 'LLM_INVALID_RESPONSE',
  LLM_NO_RESPONSE = 'LLM_NO_RESPONSE',

  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_UNAVAILABLE = 'TOOL_UNAVAILABLE',
  TOOL_INVALID_PARAMS = 'TOOL_INVALID_PARAMS',

  // Capability errors
  CAPABILITY_NOT_FOUND = 'CAPABILITY_NOT_FOUND',
  CAPABILITY_FAILED = 'CAPABILITY_FAILED',

  // Input errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_PARAM = 'MISSING_REQUIRED_PARAM',

  // Platform errors
  PLATFORM_NOT_AVAILABLE = 'PLATFORM_NOT_AVAILABLE',
  PLATFORM_SEND_FAILED = 'PLATFORM_SEND_FAILED',

  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
}

/**
 * Standard error class for Brain operations
 *
 * Provides consistent error handling with error codes,
 * retry information, and cause tracking.
 */
export class BrainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable: boolean = false,
    public override cause?: Error,
  ) {
    super(message);
    this.name = 'BrainError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BrainError);
    }
  }

  /**
   * Create an LLM API error
   */
  static llmAPI(message: string, cause?: Error): BrainError {
    return new BrainError(ErrorCode.LLM_API_ERROR, message, true, cause);
  }

  /**
   * Create an LLM rate limit error
   */
  static rateLimited(message: string): BrainError {
    return new BrainError(ErrorCode.LLM_RATE_LIMITED, message, true);
  }

  /**
   * Create an LLM invalid response error
   */
  static invalidResponse(message: string): BrainError {
    return new BrainError(ErrorCode.LLM_INVALID_RESPONSE, message, false);
  }

  /**
   * Create a tool not found error
   */
  static toolNotFound(toolName: string): BrainError {
    return new BrainError(ErrorCode.TOOL_NOT_FOUND, `Tool not found: ${toolName}`, false);
  }

  /**
   * Create a tool execution failed error
   */
  static toolExecutionFailed(toolName: string, reason: string, cause?: Error): BrainError {
    return new BrainError(
      ErrorCode.TOOL_EXECUTION_FAILED,
      `Tool execution failed: ${toolName} - ${reason}`,
      false,
      cause,
    );
  }

  /**
   * Create a tool unavailable error
   */
  static toolUnavailable(platform: string): BrainError {
    return new BrainError(ErrorCode.TOOL_UNAVAILABLE, `${platform} service not available`, false);
  }

  /**
   * Create an invalid input error
   */
  static invalidInput(message: string): BrainError {
    return new BrainError(ErrorCode.INVALID_INPUT, message, false);
  }

  /**
   * Create a capability not found error
   */
  static capabilityNotFound(capabilityId: string): BrainError {
    return new BrainError(
      ErrorCode.CAPABILITY_NOT_FOUND,
      `Unknown capability: ${capabilityId}`,
      false,
    );
  }

  /**
   * Create a platform not available error
   */
  static platformNotAvailable(platform: string): BrainError {
    return new BrainError(
      ErrorCode.PLATFORM_NOT_AVAILABLE,
      `${platform} service not available`,
      false,
    );
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      cause: this.cause?.message,
    };
  }
}

/**
 * Type guard to check if an error is a BrainError
 */
export function isBrainError(error: unknown): error is BrainError {
  return error instanceof BrainError;
}

/**
 * Safely extract error code from an unknown error
 */
export function getErrorCode(error: unknown): ErrorCode | null {
  if (isBrainError(error)) {
    return error.code;
  }
  return null;
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (isBrainError(error)) {
    return error.retryable;
  }

  // Retry network errors by default
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('econnrefused') ||
      message.includes('rate limit')
    );
  }

  return false;
}
