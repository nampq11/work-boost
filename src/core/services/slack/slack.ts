import type { BotService, BotUpdate, Platform, SendOptions } from '../../bot/bot-service.ts';
import { env } from '../../env.ts';
import { logger } from '../../logger/logger.ts';
import type { LangfuseService } from '../../observability/langfuse/langfuse.ts';

export class Slack implements BotService {
  readonly platform: Platform = 'slack';
  private baseUrl: string = `https://slack.com`;
  private slackBotToken: string;
  private signingSecret: string;
  private langfuse?: LangfuseService;

  constructor(langfuse?: LangfuseService) {
    this.slackBotToken = env.get('SLACK_BOT_TOKEN') || '';
    this.signingSecret = env.get('SLACK_SIGNING_SECRET') || '';
    this.langfuse = langfuse;
  }

  async sendMessageToChannel(blocks: object): Promise<void> {
    const channelID = env.get('SLACK_CHANNEL_ID') || '';
    // Pass blocks directly as keyboard option
    await this.sendMessage(channelID, '', { keyboard: blocks });
  }

  async sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void> {
    const startTime = Date.now();

    // Create span for tracing if Langfuse is enabled
    let span: ReturnType<ReturnType<LangfuseService['createTrace']>['span']> | null = null;
    if (this.langfuse?.isEnabled()) {
      const trace = this.langfuse.createTrace({
        name: 'slack_send_message',
        input: { chatId, content: content.substring(0, 100) + '...' },
        metadata: { platform: 'slack', hasBlocks: !!options?.keyboard },
      });
      span = trace.span({
        name: 'slack_api_call',
        input: { chatId, contentLength: content.length },
      });
    }

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
      logger.debug('Slack message sent', { response: responseJson });

      // Update span with success
      if (span) {
        span.update({
          output: { success: true, timestamp: responseJson.ts },
          metadata: { duration: Date.now() - startTime },
        });
        span.end();
      }
    } catch (error) {
      logger.error('Failed to send Slack message', { error });

      // Update span with error
      if (span) {
        span.update({
          output: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          metadata: { duration: Date.now() - startTime },
        });
        span.end();
      }

      throw error;
    }
  }

  /**
   * Validate native Request for Slack webhook
   * Uses header checks for timestamp freshness.
   * Full HMAC signature validation is handled by the slack-validation middleware.
   */
  async validateWebhook(request: Request): Promise<boolean> {
    const timestampHeader = request.headers.get('x-slack-request-timestamp');
    const signatureHeader = request.headers.get('x-slack-signature');

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

    return true;
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

  /**
   * Handle Slack webhook — returns a native Response
   */
  async handleWebhook(request: Request): Promise<Response> {
    const bodyText = await request.text();
    let body: Record<string, string>;

    try {
      // Try URL-encoded form data first (Slack's default)
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

    // Legacy responses for existing Slack integration
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

    // Default response
    return new Response('OK', { status: 200 });
  }

  /**
   * Format agent response as Slack message
   */
  formatToSlack(agentResponse: any): string {
    // Add Slack-specific formatting here if needed
    if (typeof agentResponse === 'string') {
      return agentResponse;
    }
    if (agentResponse?.summary) {
      return agentResponse.summary;
    }
    return JSON.stringify(agentResponse, null, 2);
  }
}
