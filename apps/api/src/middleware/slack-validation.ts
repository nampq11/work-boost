/// <reference lib="deno.unstable" />

import { logger } from '@work-boost/shared/logger/logger.ts';

const FIVE_MINUTES_IN_SECONDS = 60 * 5;

/**
 * Encode string to Uint8Array
 */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
 * Validate Slack webhook request signature using Web Crypto API
 *
 * Returns a 401 Response if validation fails, or null if validation passes.
 * The parsed body string is returned via the second element of the tuple.
 *
 * @param request - The incoming native Request
 * @param signingSecret - Slack signing secret
 * @param requestId - Optional request ID for logging
 * @returns [errorResponse, bodyString] - errorResponse is null if valid
 */
export async function validateSlackWebhook(
  request: Request,
  signingSecret: string,
  requestId?: string,
): Promise<{ error: Response | null; bodyString: string }> {
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');

  if (!timestamp || !signature || !signingSecret) {
    logger.warn('Slack webhook rejected: Missing required headers', { requestId });
    return { error: new Response('Unauthorized', { status: 401 }), bodyString: '' };
  }

  const timestampNum = Number(timestamp);
  if (!Number.isFinite(timestampNum)) {
    logger.warn('Slack webhook rejected: Invalid timestamp', { requestId });
    return { error: new Response('Unauthorized', { status: 401 }), bodyString: '' };
  }

  // Reject requests that are too old to mitigate replay attacks (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > FIVE_MINUTES_IN_SECONDS) {
    logger.warn('Slack webhook rejected: Timestamp too old', {
      requestId,
      timestamp: timestampNum,
      now,
    });
    return { error: new Response('Unauthorized', { status: 401 }), bodyString: '' };
  }

  // Read the raw body
  const bodyString = await request.text();

  const version = 'v0';
  const baseString = `${version}:${timestamp}:${bodyString}`;

  // Compute HMAC signature using Web Crypto API
  const key = await crypto.subtle.importKey(
    'raw',
    encode(signingSecret).buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encode(baseString).buffer as ArrayBuffer,
  );
  const expectedSignature = `${version}=${bufferToHex(signatureBuffer)}`;

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(signature, expectedSignature)) {
    logger.warn('Slack webhook rejected: Invalid signature', { requestId });
    return { error: new Response('Unauthorized', { status: 401 }), bodyString: '' };
  }

  return { error: null, bodyString };
}
