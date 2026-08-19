import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { BotService, BotUpdate, Platform, SendOptions } from '../bot/bot-service.ts';

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

export class SlackService implements BotService {
  readonly platform: Platform = 'slack';
  private baseUrl: string = 'https://slack.com';
  private slackBotToken: string;
  private signingSecret: string;

  constructor() {
    this.slackBotToken = env.get('SLACK_BOT_TOKEN') || '';
    this.signingSecret = env.get('SLACK_SIGNING_SECRET') || '';
  }

  async sendMessageToChannel(blocks: object): Promise<void> {
    const channelID = env.get('SLACK_CHANNEL_ID') || '';
    await this.sendMessage(channelID, '', { keyboard: blocks });
  }

  async sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void> {
    const url = `${this.baseUrl}/api/chat.postMessage`;

    const blocks = options?.keyboard;
    const payload = JSON.stringify({
      channel: chatId,
      text: blocks ? undefined : content,
      blocks: blocks ?? undefined,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${this.slackBotToken}`,
          Accept: 'application/json',
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }
      const responseJson = await response.json();
      if (responseJson.ok === false) {
        throw new Error(`Slack API error: ${responseJson.error || 'unknown error'}`);
      }
      logger.debug('Slack message sent', { response: responseJson });
    } catch (error) {
      logger.error('Failed to send Slack message', { error });
      throw error;
    }
  }

  /**
   * Validate native Request for Slack webhook
   */
  async validateWebhook(request: Request): Promise<boolean> {
    const timestampHeader = request.headers.get('x-slack-request-timestamp');
    const signatureHeader = request.headers.get('x-slack-signature');

    if (!timestampHeader || !signatureHeader || !this.signingSecret) {
      return false;
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      return false;
    }

    const FIVE_MINUTES_IN_SECONDS = 60 * 5;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > FIVE_MINUTES_IN_SECONDS) {
      return false;
    }

    const bodyText = await request.text();
    const signatureBase = `v0:${timestampHeader}:${bodyText}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signatureBase),
    );
    const expectedSignature =
      'v0=' +
      Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    return timingSafeEqual(signatureHeader, expectedSignature);
  }

  async parseUpdate(request: Request): Promise<BotUpdate> {
    const bodyText = await request.text();
    const params = Object.fromEntries(
      new URLSearchParams(bodyText) as unknown as Iterable<[string, string]>,
    );

    const action = (params.command?.replace('/', '') as BotUpdate['action']) || 'message';

    return {
      platform: 'slack',
      userId: params.user_id || '',
      chatId: params.channel_id || params.user_id || '',
      action,
      data: { text: params.text || '', params },
    };
  }

  async handleWebhook(request: Request): Promise<Response> {
    const bodyText = await request.text();
    let body: Record<string, string>;

    try {
      body = Object.fromEntries(
        new URLSearchParams(bodyText) as unknown as Iterable<[string, string]>,
      );
    } catch {
      try {
        body = JSON.parse(bodyText);
      } catch {
        return new Response('Invalid request body', { status: 400 });
      }
    }

    const action = body.command?.replace('/', '') || '';

    if (action === 'subscribe') {
      return new Response(
        JSON.stringify({
          response_type: 'ephemeral',
          text: 'Oke rồi, mình sẽ thông báo cho bạn mỗi sáng! 😊',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (action === 'unsubscribe') {
      return new Response(
        JSON.stringify({
          response_type: 'ephemeral',
          text: 'Oke rồi, mình sẽ không thông báo cho bạn nữa! 😊',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response('OK', { status: 200 });
  }

  formatToSlack(agentResponse: any): string {
    if (typeof agentResponse === 'string') {
      return agentResponse;
    }
    if (agentResponse?.summary) {
      return agentResponse.summary;
    }
    return JSON.stringify(agentResponse, null, 2);
  }
}
