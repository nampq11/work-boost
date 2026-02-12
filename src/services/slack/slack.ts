import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { BotService, BotUpdate, Platform, SendOptions } from '../../core/bot/bot-service.ts';
import { env } from '../../core/env.ts';

export class Slack implements BotService {
  readonly platform: Platform = 'slack';
  private baseUrl: string = `https://slack.com`;
  private slackBotToken: string;
  private signingSecret: string;

  constructor() {
    this.slackBotToken = env.get('SLACK_BOT_TOKEN') || '';
    this.signingSecret = env.get('SLACK_SIGNING_SECRET') || '';
  }

  async sendMessageToChannel(blocks: object): Promise<void> {
    const channelID = env.get('SLACK_CHANNEL_ID') || '';
    // Pass blocks directly as keyboard option
    await this.sendMessage(channelID, '', { keyboard: blocks });
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

  /**
   * Validate Express request for Slack webhook
   * Note: In Express mode, the middleware handles the raw body validation
   * This is a simplified header check for compatibility
   */
  async validateWebhook(request: ExpressRequest): Promise<boolean> {
    const timestampHeader = request.headers['x-slack-request-timestamp'] as string;
    const signatureHeader = request.headers['x-slack-signature'] as string;

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

    // In Express mode with middleware, signature validation is handled by middleware
    // The middleware has already validated the signature before reaching here
    // We return true to indicate the request structure is valid
    return true;
  }

  async parseUpdate(request: ExpressRequest): Promise<BotUpdate> {
    // Body is already parsed by middleware
    const body = request.body as any;
    const params = body || {};

    const action = (params.command?.replace('/', '') as BotUpdate['action']) || 'message';

    return {
      platform: 'slack',
      userId: params.user_id || '',
      chatId: params.channel_id || params.user_id || '',
      action,
      data: { text: params.text || '', params },
    };
  }

  /**
   * Handle Slack webhook in Express mode
   * This is called by the Express route handler
   */
  async handleWebhook(request: ExpressRequest, response: ExpressResponse): Promise<void> {
    // Body is already parsed by validation middleware
    const body = request.body as any;
    const action = body.command?.replace('/', '') || '';

    // Legacy responses for existing Slack integration
    if (action === 'subscribe') {
      response.status(200).json({
        response_type: 'ephemeral',
        text: 'Oke rồi, mình sẽ thông báo cho bạn mỗi sáng! 😊',
      });
      return;
    }

    if (action === 'unsubscribe') {
      response.status(200).json({
        response_type: 'ephemeral',
        text: 'Oke rồi, mình sẽ không thông báo cho bạn nữa! 😊',
      });
      return;
    }

    // Default response
    response.status(200).send('OK');
  }

  /**
   * Format agent response as Slack message
   */
  formatToSlack(agentResponse: any): string {
    // Add Slack-specific formatting here if needed
    // For now, return the text content as-is
    if (typeof agentResponse === 'string') {
      return agentResponse;
    }
    if (agentResponse?.summary) {
      return agentResponse.summary;
    }
    return JSON.stringify(agentResponse, null, 2);
  }
}
