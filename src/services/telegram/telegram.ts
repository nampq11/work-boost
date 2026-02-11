import { autoRetry } from '@grammyjs/auto-retry';
import { limit } from '@grammyjs/ratelimiter';
import { Bot, GrammyError } from 'grammy';
import { webhookCallback } from 'grammy';
import type { BotService, BotUpdate, Platform, SendOptions } from '../../core/bot/bot-service.ts';
import type { Agent, Database } from '../_index.ts';
import * as handlers from './handlers/index.ts';
import { mainMenuKeyboard } from './keyboards.ts';

export class TelegramService implements BotService {
  readonly platform: Platform = 'telegram';
  private bot: Bot;
  private db: Database;
  private agent: Agent;
  private webhookSecret: string;

  constructor(db: Database, agent: Agent) {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
    this.db = db;
    this.agent = agent;
    this.bot = new Bot(token);

    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    // Auto-retry for rate limits and server errors
    this.bot.api.config.use(
      autoRetry({
        maxRetryAttempts: 3,
        maxDelaySeconds: 60,
      }),
    );

    // Rate limiting per user
    this.bot.use(
      limit({
        timeFrame: 2000,
        limit: 3,
        onLimitExceeded: async (ctx) => {
          await ctx.reply('Please slow down! Try again in a few seconds.');
        },
      }),
    );
  }

  private setupHandlers(): void {
    const deps = { db: this.db, agent: this.agent, subscription: {} as any };

    // Command handlers
    this.bot.command('start', (ctx) => handlers.handleStart(ctx));
    this.bot.command('subscribe', (ctx) => handlers.handleSubscribe(ctx, deps));
    this.bot.command('unsubscribe', (ctx) => handlers.handleUnsubscribe(ctx, deps));
    this.bot.command('status', (ctx) => handlers.handleStatus(ctx, deps));
    this.bot.command('help', () => handlers.handleHelp());

    // Message handler (must be last - catches all text messages)
    this.bot.on('message:text', (ctx) => handlers.handleMessage(ctx, deps));

    // Callback query handlers (button presses)
    this.bot.callbackQuery('action:subscribe', (ctx) =>
      handlers.handleSubscribeCallback(ctx, deps),
    );
    this.bot.callbackQuery('action:unsubscribe', (ctx) =>
      handlers.handleUnsubscribeCallback(ctx, deps),
    );
    this.bot.callbackQuery('action:unsubscribe_confirm', (ctx) =>
      handlers.handleUnsubscribeConfirm(ctx, deps),
    );
    this.bot.callbackQuery('action:status', (ctx) => handlers.handleStatusCallback(ctx, deps));
    this.bot.callbackQuery('action:help', () => handlers.handleHelpCallback());
    this.bot.callbackQuery('action:cancel', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('Cancelled.', {
        reply_markup: mainMenuKeyboard(),
      });
    });

    // Error handler
    this.bot.catch((err) => {
      const ctx = err.ctx;
      const e = err.error;

      console.error('Telegram bot error:', {
        error: e,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
      });

      if (e instanceof GrammyError) {
        if (e.error_code === 403) {
          // User blocked bot - disable platform for that user
          if (ctx.from?.id) {
            this.db.disablePlatform(ctx.from.id.toString(), 'telegram').catch(console.error);
          }
        }
      }
    });
  }

  async sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, content, {
        parse_mode: options?.parseMode === 'None' ? undefined : options?.parseMode || 'HTML',
      });
    } catch (error) {
      console.error('Failed to send Telegram message:', { error, chatId });
      throw error;
    }
  }

  async validateWebhook(request: Request): Promise<boolean> {
    // Check secret token header if configured
    if (this.webhookSecret) {
      const receivedToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (receivedToken !== this.webhookSecret) {
        return false;
      }
    }
    return true;
  }

  async parseUpdate(request: Request): Promise<BotUpdate> {
    const body = await request.json();
    // Telegram updates are complex, return minimal info
    return {
      platform: 'telegram',
      userId: body.message?.from?.id?.toString() || body.callback_query?.from?.id?.toString() || '',
      chatId:
        body.message?.chat?.id?.toString() ||
        body.callback_query?.message?.chat?.id?.toString() ||
        '',
      action: 'start', // Default, will be determined by handlers
      data: body,
    };
  }

  async handleWebhook(request: Request): Promise<Response> {
    const handleUpdate = webhookCallback(this.bot, 'std/http');
    return handleUpdate(request);
  }

  /**
   * Start the bot using long polling (for development)
   */
  async start(): Promise<void> {
    await this.bot.start();
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    await this.bot.stop();
  }

  /**
   * Get the underlying bot instance
   */
  getBot(): Bot {
    return this.bot;
  }
}
