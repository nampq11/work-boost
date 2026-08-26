import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { env, timingSafeEqual } from '@work-boost/shared';
import { logger, redactRecursively } from '@work-boost/shared/logger/logger.ts';
import { Bot } from 'grammy';
import { webhookCallback } from 'grammy';
import type { ExtensionMessageSender, Platform, SendOptions } from '../types.ts';
import {
  type TelegramContext,
  registerTelegramHandlers,
  setupTelegramMiddleware,
} from './wiring.ts';

export type { TelegramContext } from './wiring.ts';

export class TelegramService implements ExtensionMessageSender {
  readonly platform: Platform = 'telegram';
  private bot: Bot<TelegramContext>;
  private db: Database;
  private agent: AgentPort;
  private webhookSecret: string;

  constructor(db: Database, agent: AgentPort) {
    const token = env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.webhookSecret = env.get('TELEGRAM_WEBHOOK_SECRET') || '';
    this.db = db;
    this.agent = agent;
    this.bot = new Bot<TelegramContext>(token);

    setupTelegramMiddleware(this.bot);
    registerTelegramHandlers(this.bot, { db, agent });
  }

  async sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void> {
    const parseMode = options?.parseMode === 'None' ? undefined : options?.parseMode || 'HTML';
    try {
      await this.bot.api.sendMessage(chatId, content, { parse_mode: parseMode });
    } catch (error) {
      const details = redactRecursively({
        errorMessage: error instanceof Error ? error.message : String(error),
        chatId,
      });
      if (parseMode === undefined) {
        logger.error('Failed to send Telegram message', { details });
        throw error;
      }
      // Formatted delivery failed: retry as plain text. Agent output or a chunk
      // split can produce markup Telegram rejects, which would otherwise drop the
      // message entirely.
      logger.warn('Telegram formatted delivery failed, falling back to plain text', { error });
      await this.bot.api.sendMessage(chatId, stripHtmlTags(content), { parse_mode: undefined });
    }
  }

  async validateWebhook(request: Request): Promise<boolean> {
    const isProduction = env.get('DENO_ENV') === 'production';
    if (isProduction && !this.webhookSecret) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET must be configured in production');
    }

    if (this.webhookSecret) {
      const receivedToken = request.headers.get('x-telegram-bot-api-secret-token');
      if (!receivedToken || receivedToken.length !== this.webhookSecret.length) {
        return false;
      }
      return timingSafeEqual(receivedToken, this.webhookSecret);
    }

    return !isProduction;
  }

  handleWebhook(request: Request): Promise<Response> {
    return webhookCallback(this.bot, 'std/http')(request);
  }

  async start(): Promise<void> {
    await this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  getBot(): Bot<TelegramContext> {
    return this.bot;
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}
