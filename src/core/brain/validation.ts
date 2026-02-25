/**
 * Brain Validation
 *
 * Parameter validation for tools and capabilities.
 */

import { BrainError, ErrorCode } from './errors.ts';

/**
 * Validation schema for a parameter
 */
export interface ParamSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: readonly unknown[] | unknown[];
  min?: number;
  max?: number;
  description?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Regular expressions for common validation patterns
 */
export const PATTERNS = {
  // Chat ID patterns for different platforms
  slackChatId: /^[A-Z0-9]{9,12}$/,
  telegramChatId: /^-?\d{7,14}$/,
  genericId: /^[A-Za-z0-9_-]+$/,

  // Validation patterns
  safeString: /^[A-Za-z0-9\s\-_.,!?@#$%&*()+=\[\]{}|;:'"<>?/~`]+$/,
  noControlChars: /^[^\x00-\x1F\x7F]*$/, // No control characters except newline/tab
} as const;

/**
 * Validate tool parameters against a schema
 */
export function validateToolParams<T extends Record<string, unknown>>(
  params: unknown,
  schema: Record<string, ParamSchema>,
): ValidationResult {
  if (!params || typeof params !== 'object') {
    return {
      valid: false,
      error: 'Parameters must be an object',
    };
  }

  if (Array.isArray(params)) {
    return {
      valid: false,
      error: 'Parameters must be an object, not an array',
    };
  }

  const data = params as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // Check all required fields are present
  for (const [key, spec] of Object.entries(schema)) {
    const value = data[key];

    // Check required fields
    if (spec.required && (value === undefined || value === null)) {
      return {
        valid: false,
        error: `Missing required parameter: ${key}`,
      };
    }

    // Skip validation if value is undefined and not required
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation
    const typeError = validateType(key, value, spec);
    if (typeError) {
      return { valid: false, error: typeError };
    }

    // String-specific validation
    if (spec.type === 'string' && typeof value === 'string') {
      const strError = validateString(key, value, spec);
      if (strError) {
        return { valid: false, error: strError };
      }
    }

    // Number-specific validation
    if (spec.type === 'number' && typeof value === 'number') {
      const numError = validateNumber(key, value, spec);
      if (numError) {
        return { valid: false, error: numError };
      }
    }

    // Array-specific validation
    if (spec.type === 'array' && Array.isArray(value)) {
      const arrError = validateArray(key, value, spec);
      if (arrError) {
        return { valid: false, error: arrError };
      }
    }

    // Enum validation
    if (spec.enum && !spec.enum.includes(value)) {
      return {
        valid: false,
        error: `Parameter ${key} must be one of: ${[...spec.enum].join(', ')}`,
      };
    }

    result[key] = value;
  }

  return { valid: true, data: result as T };
}

/**
 * Validate parameter type
 */
function validateType(key: string, value: unknown, spec: ParamSchema): string | null {
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') {
        return `Parameter ${key} must be a string`;
      }
      break;
    case 'number':
      if (typeof value !== 'number') {
        return `Parameter ${key} must be a number`;
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return `Parameter ${key} must be a boolean`;
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        return `Parameter ${key} must be an array`;
      }
      break;
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return `Parameter ${key} must be an object`;
      }
      break;
  }
  return null;
}

/**
 * Validate string constraints
 */
function validateString(key: string, value: string, spec: ParamSchema): string | null {
  // Min length
  if (spec.minLength !== undefined && value.length < spec.minLength) {
    return `Parameter ${key} must be at least ${spec.minLength} characters`;
  }

  // Max length
  if (spec.maxLength !== undefined && value.length > spec.maxLength) {
    return `Parameter ${key} must be at most ${spec.maxLength} characters`;
  }

  // Pattern match
  if (spec.pattern && !spec.pattern.test(value)) {
    return `Parameter ${key} contains invalid characters`;
  }

  // Check for control characters (security)
  if (!PATTERNS.noControlChars.test(value)) {
    return `Parameter ${key} contains invalid control characters`;
  }

  return null;
}

/**
 * Validate number constraints
 */
function validateNumber(key: string, value: number, spec: ParamSchema): string | null {
  // Min value
  if (spec.min !== undefined && value < spec.min) {
    return `Parameter ${key} must be at least ${spec.min}`;
  }

  // Max value
  if (spec.max !== undefined && value > spec.max) {
    return `Parameter ${key} must be at most ${spec.max}`;
  }

  return null;
}

/**
 * Validate array constraints
 */
function validateArray(key: string, value: unknown[], spec: ParamSchema): string | null {
  // Min length
  if (spec.minLength !== undefined && value.length < spec.minLength) {
    return `Parameter ${key} must have at least ${spec.minLength} items`;
  }

  // Max length
  if (spec.maxLength !== undefined && value.length > spec.maxLength) {
    return `Parameter ${key} must have at most ${spec.maxLength} items`;
  }

  return null;
}

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  // Remove potentially dangerous control characters
  return input
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Control characters except tab/newline
    .trim();
}

/**
 * Validate a chat ID for different platforms
 */
export function validateChatId(chatId: string, platform?: 'slack' | 'telegram'): ValidationResult {
  if (!chatId || typeof chatId !== 'string') {
    return {
      valid: false,
      error: 'Chat ID must be a non-empty string',
    };
  }

  const sanitized = sanitizeInput(chatId);

  if (platform === 'slack') {
    if (!PATTERNS.slackChatId.test(sanitized)) {
      return {
        valid: false,
        error: `Invalid Slack chat ID format. Expected 9-12 alphanumeric characters.`,
      };
    }
  } else if (platform === 'telegram') {
    if (!PATTERNS.telegramChatId.test(sanitized)) {
      return {
        valid: false,
        error: `Invalid Telegram chat ID format. Expected 7-14 digits, optionally starting with -.`,
      };
    }
  } else {
    // Generic validation - just check for safe characters
    if (!PATTERNS.genericId.test(sanitized)) {
      return {
        valid: false,
        error: `Invalid chat ID format. Only alphanumeric, underscore, and hyphen allowed.`,
      };
    }
  }

  return { valid: true, data: { chatId: sanitized } };
}

/**
 * Validation schemas for common tool parameters
 */
export const SCHEMAS = {
  sendMessage: {
    platform: { type: 'string' as const, required: true, enum: ['slack', 'telegram'] },
    chatId: { type: 'string' as const, required: true, minLength: 1, maxLength: 100 },
    text: { type: 'string' as const, required: true, minLength: 1, maxLength: 4000 },
    parseMode: {
      type: 'string' as const,
      required: false,
      enum: ['HTML', 'Markdown', 'None'],
    },
  },

  sendSlackBlocks: {
    chatId: { type: 'string' as const, required: true, minLength: 1, maxLength: 100 },
    blocks: { type: 'array' as const, required: true, maxLength: 100 },
  },

  sendTelegramKeyboard: {
    chatId: { type: 'string' as const, required: true, minLength: 1, maxLength: 100 },
    text: { type: 'string' as const, required: true, minLength: 1, maxLength: 4000 },
    keyboard: { type: 'array' as const, required: true, maxLength: 50 },
    parseMode: {
      type: 'string' as const,
      required: false,
      enum: ['HTML', 'Markdown', 'None'],
    },
  },

  formatDailyReport: {
    completed: { type: 'array' as const, required: true, maxLength: 50 },
    incomplete: { type: 'array' as const, required: true, maxLength: 50 },
    planned: { type: 'array' as const, required: true, maxLength: 50 },
  },

  formatDebtEntry: {
    direction: {
      type: 'string' as const,
      required: true,
      enum: ['lent', 'borrowed'],
    },
    amount: { type: 'number' as const, required: true, min: 0 },
    currency: { type: 'string' as const, required: true, minLength: 3, maxLength: 3 },
    person: { type: 'string' as const, required: true, minLength: 1, maxLength: 100 },
    reason: { type: 'string' as const, required: false, maxLength: 500 },
  },
} as const;
