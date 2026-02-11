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
    const payload = JSON.stringify({
      channel: chatId,
      text: content,
      blocks: options?.keyboard ? this.buildBlocks(content) : undefined,
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
    await this.sendMessage(channelID, '', { keyboard: blocks as any });
  }

  async validateWebhook(request: Request): Promise<boolean> {
    // Basic validation - check for Slack headers
    const timestamp = request.headers.get('X-Slack-Request-Timestamp');
    const signature = request.headers.get('X-Slack-Signature');

    if (!timestamp || !signature) {
      return false;
    }

    // TODO: Implement proper signature verification
    // For now, just check that headers exist
    return true;
  }

  async parseUpdate(request: Request): Promise<BotUpdate> {
    const body = await request.text();
    const params = new URLSearchParams(body);

    const action = (params.get('command')?.replace('/', '') as BotUpdate['action']) || 'message';
    const userId = params.get('user_id') || '';
    const text = params.get('text') || '';

    return {
      platform: 'slack',
      userId,
      chatId: params.get('channel_id') || userId,
      action,
      data: { text, params: Object.fromEntries(params) },
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

  private buildBlocks(content: string): object {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: content,
        },
      },
    ];
  }
}
