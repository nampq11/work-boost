import { autoRetry } from '@grammyjs/auto-retry';
import { type RateLimiter, limit } from '@grammyjs/ratelimiter';
import { Bot, GrammyError } from 'grammy';
import { webhookCallback } from 'grammy';
import type { BotService, BotUpdate, Platform, SendOptions } from '../../core/bot/bot-service.ts';
import type { Agent, Database } from '../_index.ts';
import * as handlers from './handlers/index.ts';
import { mainMenuKeyboard } from './keyboards.ts';
import { createSanitizationMiddleware } from './sanitizer.ts';

/**
 * Redact sensitive data from objects before logging
 */
function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['token', 'password', 'secret', 'apiKey', 'botToken', 'error'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const shouldRedact = sensitiveKeys.some((sensitive) =>
      keyLower.includes(sensitive.toLowerCase()),
    );

    if (shouldRedact && typeof value === 'string' && value.length > 0) {
      result[key] = '[REDACTED]';
    } else if (shouldRedact && typeof value === 'object' && value !== null) {
      // Recursively redact nested objects
      result[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Get rate limit from environment or use default
 */
function getRateLimit(type: 'interactive' | 'bulk'): number {
  if (type === 'interactive') {
    const limit = Deno.env.get('TELEGRAM_RATE_LIMIT_INTERACTIVE');
    return limit ? parseInt(limit, 10) : 3;
  } else {
    const limit = Deno.env.get('TELEGRAM_RATE_LIMIT_BULK');
    return limit ? parseInt(limit, 10) : 25;
  }
}

export class TelegramService implements BotService {
  readonly platform: Platform = 'telegram';
  private bot: Bot;
  private db: Database;
  private agent: Agent;
  private webhookSecret: string;
  private bulkLimiter: RateLimiter;

  constructor(db: Database, agent: Agent) {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
    this.db = db;
    this.agent = agent;
    this.bot = new Bot(token);

    // Create separate rate limiter for bulk operations (higher limit)
    this.bulkLimiter = limit({
      timeFrame: 1000,
      limit: getRateLimit('bulk'),
      onLimitExceeded: async () => {
        // Silently wait for bulk operations
        await new Promise((resolve) => setTimeout(resolve, 1000));
      },
    });

    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    // Input sanitization - must be first, before rate limiting
    this.bot.use(createSanitizationMiddleware());

    // Auto-retry for rate limits and server errors
    this.bot.api.config.use(
      autoRetry({
        maxRetryAttempts: 3,
        maxDelaySeconds: 60,
      }),
    );

    // Rate limiting per user (interactive commands only)
    this.bot.use(
      limit({
        timeFrame: 2000,
        limit: getRateLimit('interactive'),
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

      // Sanitize error before logging (redact sensitive data)
      console.error(
        'Telegram bot error:',
        redactSensitiveData({
          errorMessage: e instanceof Error ? e.message : String(e),
          errorCode: e instanceof GrammyError ? e.error_code : undefined,
          userId: ctx.from?.id,
          chatId: ctx.chat?.id,
        }),
      );

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
      console.error(
        'Failed to send Telegram message:',
        redactSensitiveData({
          errorMessage: error instanceof Error ? error.message : String(error),
          chatId,
        }),
      );
      throw error;
    }
  }

  /**
   * Send a bulk message (for daily summaries) with higher rate limit
   * This bypasses the bot's rate limiting middleware and uses the bulk limiter instead
   */
  async sendBulkMessage(chatId: string, content: string): Promise<void> {
    await this.bulkLimiter.control(() =>
      this.bot.api.sendMessage(chatId, content, { parse_mode: 'HTML' }),
    );
  }

  async validateWebhook(request: Request): Promise<boolean> {
    // In production, webhook secret is required
    const isProduction = Deno.env.get('DENO_ENV') === 'production';
    if (isProduction && !this.webhookSecret) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET must be configured in production');
    }

    // Check secret token header if configured
    if (this.webhookSecret) {
      const receivedToken = request.headers.get('x-telegram-bot-api-secret-token');

      // Early return if missing or wrong length
      if (!receivedToken || receivedToken.length !== this.webhookSecret.length) {
        return false;
      }

      // Use timing-safe comparison to prevent timing attacks
      const receivedBytes = new TextEncoder().encode(receivedToken);
      const expectedBytes = new TextEncoder().encode(this.webhookSecret);

      return await crypto.subtle.timingSafeEqual(receivedBytes, expectedBytes);
    }

    // Allow requests in development without secret (for local testing)
    return !isProduction;
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
