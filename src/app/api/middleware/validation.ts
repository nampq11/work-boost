import { NextFunction, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { formatError } from 'zod/v4/core';
import { ERROR_CODES, errorResponse } from '../utils/response.ts';
import { isValidSessionId, sanitizeInput } from '../utils/security.ts';

/**
 * Middleware to check validation results and return error if validation failed
 */
export function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    errorResponse(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      'Validation failed',
      400,
      errors.array(),
      req.requestId,
    );
    return;
  }

  next();
}

/*
 * Sanitize text input middleware
 */
export function sanitizeTextInput(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const field of fields) {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = sanitizeInput(req.body[field]);
      }
    }
    next();
  };
}

// Validation schemas for different endpoints

/**
 * Message processing validation
 */
export const validateMessageRequest = [
  body('message')
    .isString()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Message must be between 1 and 5000 characters'),
  body('sessionId')
    .optional()
    .custom((value) => {
      if (value && !isValidSessionId(value)) {
        throw new Error('Invalid session ID format');
      }
      return true;
    }),
  body('images').optional().isArray().withMessage('Images must be an array'),
  body('images.*').optional().isString().withMessage('Each image must be a base64 string'),
  sanitizeTextInput(['message']),
  handleValidationErrors,
];

/**
 * Session ID parameter validation
 */
export const validateSessionId = [
  param('sessionId').custom((value) => {
    if (!isValidSessionId(value)) {
      throw new Error('Invalid session ID format');
    }
    return true;
  }),
  handleValidationErrors,
];

/**
 * Session creation validation
 */
export const validateCreateSession = [
  body('sessionId')
    .optional()
    .custom((value) => {
      if (value && !isValidSessionId(value)) {
        throw new Error('Invalid session ID format');
      }
      return true;
    }),
  body('config').optional().isObject().withMessage('Config must be an object'),
  handleValidationErrors,
];
