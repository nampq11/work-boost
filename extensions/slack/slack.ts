import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { BotService, Platform, SendOptions } from '../bot/bot-service.ts';

export class SlackService implements BotService {
  readonly platform: Platform = 'slack';
  private baseUrl: string = 'https://slack.com';
  private slackBotToken: string;
  constructor() {
    this.slackBotToken = env.get('SLACK_BOT_TOKEN') || '';
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
}
