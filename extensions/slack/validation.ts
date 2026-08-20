import { timingSafeEqual } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';

const FIVE_MINUTES_IN_SECONDS = 60 * 5;

export async function validateSlackWebhook(
  request: Request,
  signingSecret: string,
): Promise<{ error: Response | null; bodyString: string }> {
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');

  if (!timestamp || !signature || !signingSecret) {
    logger.warn('Slack webhook rejected: Missing required headers');
    return unauthorized();
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    logger.warn('Slack webhook rejected: Invalid timestamp');
    return unauthorized();
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNumber) > FIVE_MINUTES_IN_SECONDS) {
    logger.warn('Slack webhook rejected: Timestamp too old', {
      timestamp: timestampNumber,
      now,
    });
    return unauthorized();
  }

  const bodyString = await request.text();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v0:${timestamp}:${bodyString}`),
  );
  const expectedSignature = `v0=${Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;

  if (!timingSafeEqual(signature, expectedSignature)) {
    logger.warn('Slack webhook rejected: Invalid signature');
    return unauthorized();
  }

  return { error: null, bodyString };
}

function unauthorized(): { error: Response; bodyString: string } {
  return { error: new Response('Unauthorized', { status: 401 }), bodyString: '' };
}
