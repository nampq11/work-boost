import type { BotService, BotUpdate, Platform, SendOptions } from '../../core/bot/bot-service.ts';

export class Slack implements BotService {
  readonly platform: Platform = 'slack';
  private baseUrl: string = `https://slack.com`;
  private slackBotToken: string;
  private signingSecret: string;

  constructor() {
    this.slackBotToken = Deno.env.get('SLACK_BOT_TOKEN') || '';
    this.signingSecret = Deno.env.get('SLACK_SIGNING_SECRET') || '';
  }

  async sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void> {
    const url = `${this.baseUrl}/api/chat.postMessage`;

    // Use keyboard as blocks if provided (for rich formatting)
    const blocks = options?.keyboard;
    const payload = JSON.stringify({
      channel: chatId,
      text: blocks ? undefined : content, // Only include text if no blocks
      blocks: blocks ?? undefined,
    });

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.slackBotToken}`,
        Accept: 'application/json',
      },
      body: payload,
    };

    try {
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }
      const responseJson = await response.json();
      console.log('Slack message sent:', responseJson);
    } catch (error) {
      console.error('Failed to send Slack message:', error);
      throw error;
    }
  }

  // Legacy method for compatibility with existing code
  async sendMessageToChannel(blocks: object): Promise<void> {
    const channelID = Deno.env.get('SLACK_CHANNEL_ID') || '';
    // Pass blocks directly as the keyboard option
    await this.sendMessage(channelID, '', { keyboard: blocks });
  }

  async validateWebhook(request: Request): Promise<boolean> {
    const timestampHeader = request.headers.get('X-Slack-Request-Timestamp');
    const signatureHeader = request.headers.get('X-Slack-Signature');

    // Require headers and signing secret
    if (!timestampHeader || !signatureHeader || !this.signingSecret) {
      return false;
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      return false;
    }

    // Reject requests that are too old to mitigate replay attacks (5 minutes)
    const FIVE_MINUTES_IN_SECONDS = 60 * 5;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > FIVE_MINUTES_IN_SECONDS) {
      return false;
    }

    // Clone the request to read the body without consuming it
    const body = await request.clone().text();

    const version = 'v0';
    const baseString = `${version}:${timestampHeader}:${body}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.signingSecret);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBuffer = await crypto.suble.sign('HMAC', cryptoKey, encoder.encode(baseString));

    const hexSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const expectedSignature = `${version}=${hexSignature}`;

    // Constant-time comparison to avoid timing attacks
    if (signatureHeader.length !== expectedSignature.length) {
      return false;
    }

    let diff = 0;
    for (let i = 0; i < signatureHeader.length; i++) {
      diff |= signatureHeader.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return diff === 0;
  }

  async parseUpdate(request: Request): Promise<BotUpdate> {
    const body = await request.text();
    const params = new URLSearchParams(body);

    const action = (params.get('command')?.replace('/', '') as BotUpdate['action']) || 'message';

    return {
      platform: 'slack',
      userId: params.get('user_id') || '',
      chatId: params.get('channel_id') || params.get('user_id') || '',
      action,
      data: { text: params.get('text') || '', params: Object.fromEntries(params) },
    };
  }

  async handleWebhook(request: Request): Promise<Response> {
    // Legacy Slack webhook handling - returns Response for main.ts compatibility
    const body = await request.text();
    const params = new URLSearchParams(body);

    const action = params.get('command')?.replace('/', '') || '';
    const userId = params.get('user_id') || '';
    const username = params.get('user_name') || '';

    // Legacy responses for existing Slack integration
    if (action === 'subscribe') {
      return new Response(
        JSON.stringify({
          response_type: 'ephemeral',
          text: 'Oke rồi, mình sẽ thông báo cho bạn mỗi sáng! 😊',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json;' },
        },
      );
    }

    if (action === 'unsubscribe') {
      return new Response(
        JSON.stringify({
          response_type: 'ephemeral',
          text: 'Oke rồi, mình sẽ không thông báo cho bạn nữa! 😊',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json;' },
        },
      );
    }

    // Default response
    return new Response('OK', { status: 200 });
  }
}
