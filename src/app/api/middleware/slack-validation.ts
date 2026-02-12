import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../../../core/logger/logger.ts';

const FIVE_MINUTES_IN_SECONDS = 60 * 5;

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Create Slack webhook validation middleware
 * Validates HMAC signature and timestamp using timing-safe comparison
 *
 * IMPORTANT: This middleware requires express.raw() to be applied BEFORE it
 * to capture raw body for signature verification
 *
 * @param signingSecret - Slack signing secret from environment
 * @returns Express middleware function
 */
export function slackWebhookValidation(signingSecret: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const signature = req.headers['x-slack-signature'] as string;

    if (!timestamp || !signature || !signingSecret) {
      logger.warn('Slack webhook rejected: Missing required headers', {
        requestId: (req as any).requestId,
      });
      res.status(401).send('Unauthorized');
      return;
    }

    const timestampNum = Number(timestamp);
    if (!Number.isFinite(timestampNum)) {
      logger.warn('Slack webhook rejected: Invalid timestamp', {
        requestId: (req as any).requestId,
      });
      res.status(401).send('Unauthorized');
      return;
    }

    // Reject requests that are too old to mitigate replay attacks (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampNum) > FIVE_MINUTES_IN_SECONDS) {
      logger.warn('Slack webhook rejected: Timestamp too old', {
        requestId: (req as any).requestId,
        timestamp: timestampNum,
        now,
      });
      res.status(401).send('Unauthorized');
      return;
    }

    // Raw body from express.raw()
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      logger.error('Slack validation middleware: req.body is not a Buffer', {
        requestId: (req as any).requestId,
      });
      res.status(500).send('Server configuration error');
      return;
    }

    const bodyString = rawBody.toString('utf-8');
    const version = 'v0';
    const baseString = `${version}:${timestamp}:${bodyString}`;

    // Compute HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex');

    const expectedSignatureHeader = `${version}=${expectedSignature}`;

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignatureHeader.length) {
      logger.warn('Slack webhook rejected: Signature length mismatch', {
        requestId: (req as any).requestId,
      });
      res.status(401).send('Unauthorized');
      return;
    }

    let diff = 0;
    for (let i = 0; i < signature.length; i++) {
      diff |= signature.charCodeAt(i) ^ expectedSignatureHeader.charCodeAt(i);
    }

    if (diff !== 0) {
      logger.warn('Slack webhook rejected: Invalid signature', {
        requestId: (req as any).requestId,
      });
      res.status(401).send('Unauthorized');
      return;
    }

    // Attach parsed body to request for next middleware
    try {
      req.body = JSON.parse(bodyString);
    } catch (err) {
      logger.error('Failed to parse Slack webhook body', {
        requestId: (req as any).requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(400).send('Invalid JSON');
      return;
    }

    next();
  };
}
