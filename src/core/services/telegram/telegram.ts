import { autoRetry } from '@grammyjs/auto-retry';
import { limit, type RateLimiter } from '@grammyjs/ratelimiter';
import { Bot, GrammyError, type Context } from 'grammy';
import { webhookCallback } from 'grammy';
import { stream, type StreamFlavor } from '@grammyjs/stream';
import type { BotService, BotUpdate, Platform, SendOptions } from '../../bot/bot-service.ts';
import { env } from '../../env.ts';
import type { LangfuseService } from '../../observability/langfuse/langfuse.ts';
import type { Agent, Database } from '../index.ts';
import { handleDebtInput, hasPendingDebt } from './handlers/debt/debt.ts';
import * as debtHandlers from './handlers/debt/index.ts';
import * as handlers from './handlers/index.ts';
import { mainMenuKeyboard } from './keyboards.ts';
import { createSanitizationMiddleware } from './sanitizer.ts';

// Export the context type with streaming support
export type TelegramContext = StreamFlavor<Context>;

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Deno doesn't have crypto.subtle.timingSafeEqual, so we implement our own.
 */
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

/**
 * Redact sensitive data from objects before logging
 */
function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['token', 'password', 'secret', 'apiKey', 'botToken', 'error'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const shouldRedact = sensitiveKeys.some((sensitive) =>
      keyLower.includes(sensitive.toLowerCase())
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
    const limit = env.get('TELEGRAM_RATE_LIMIT_INTERACTIVE');
    return limit ? parseInt(limit, 10) : 3;
  } else {
    const limit = env.get('TELEGRAM_RATE_LIMIT_BULK');
    return limit ? parseInt(limit, 10) : 25;
  }
}

export class TelegramService implements BotService {
  readonly platform: Platform = 'telegram';
  private bot: Bot<TelegramContext>;
  private db: Database;
  private agent: Agent;
  private webhookSecret: string;
  private bulkLimiter: RateLimiter;
  private langfuse?: LangfuseService;

  constructor(db: Database, agent: Agent, langfuse?: LangfuseService) {
    const token = env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.webhookSecret = env.get('TELEGRAM_WEBHOOK_SECRET') || '';
    this.db = db;
    this.agent = agent;
    this.langfuse = langfuse;
    this.bot = new Bot<TelegramContext>(token);

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
    // Streaming support for long text messages
    this.bot.use(stream());

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
    const deps = { db: this.db, agent: this.agent };

    // Command handlers
    this.bot.command('start', (ctx) => handlers.handleStart(ctx));
    this.bot.command('subscribe', (ctx) => handlers.handleSubscribe(ctx, deps));
    this.bot.command('unsubscribe', (ctx) => handlers.handleUnsubscribe(ctx, deps));
    this.bot.command('status', (ctx) => handlers.handleStatus(ctx, deps));
    this.bot.command('help', (ctx) => handlers.handleHelp(ctx));

    // Debt commands
    this.bot.command('debt', (ctx) => debtHandlers.handleDebt(ctx, deps));
    this.bot.command('d', (ctx) => debtHandlers.handleDebt(ctx, deps)); // Alias
    this.bot.command('debts', (ctx) => debtHandlers.handleListDebts(ctx, deps));
    this.bot.command('dlist', (ctx) => debtHandlers.handleListDebts(ctx, deps)); // Alias
    this.bot.command('settle', (ctx) => debtHandlers.handleSettleCommand(ctx, deps));
    this.bot.command('delete', async (ctx) => {
      const userId = ctx.from?.id.toString();
      if (userId && hasPendingDebt(userId)) {
        await debtHandlers.handleDeleteCommand(ctx, deps);
      }
    });
    this.bot.command('debtsummary', (ctx) => debtHandlers.handleDebtSummary(ctx, deps));
    this.bot.command('dsummary', (ctx) => debtHandlers.handleDebtSummary(ctx, deps)); // Alias
    this.bot.command('remind', (ctx) => debtHandlers.handleRemind(ctx, deps));

    // Message handler (must be last - catches all text messages)
    this.bot.on('message:text', async (ctx) => {
      // Check if user has a pending debt entry
      const userId = ctx.from?.id.toString();
      const messageText = ctx.message?.text || '';

      if (userId && hasPendingDebt(userId)) {
        const handled = await handleDebtInput(ctx, deps, messageText);
        if (handled) return;
      }

      // Fall through to regular message handler
      await handlers.handleMessage(ctx, deps);
    });

    // Callback query handlers (button presses)
    this.bot.callbackQuery(
      'action:subscribe',
      (ctx) => handlers.handleSubscribeCallback(ctx, deps),
    );
    this.bot.callbackQuery(
      'action:unsubscribe',
      (ctx) => handlers.handleUnsubscribeCallback(ctx, deps),
    );
    this.bot.callbackQuery(
      'action:unsubscribe_confirm',
      (ctx) => handlers.handleUnsubscribeConfirm(ctx, deps),
    );
    this.bot.callbackQuery('action:status', (ctx) => handlers.handleStatusCallback(ctx, deps));
    this.bot.callbackQuery('action:help', (ctx) => handlers.handleHelpCallback(ctx));
    this.bot.callbackQuery('action:cancel', async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from?.id.toString();
      if (userId) {
        const { clearPendingDebt } = await import('./handlers/debt/debt.ts');
        clearPendingDebt(userId);
      }
      await ctx.editMessageText('Cancelled.', {
        reply_markup: mainMenuKeyboard(),
      });
    });

    // Debt callback handlers - all action:debt:* callbacks
    this.bot.callbackQuery(/^action:debt:/, (ctx) => debtHandlers.handleDebtCallback(ctx, deps));

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
    const startTime = Date.now();

    // Create span for tracing if Langfuse is enabled
    let span: ReturnType<ReturnType<LangfuseService['createTrace']>['span']> | null = null;
    let trace: ReturnType<LangfuseService['createTrace']> | null = null;
    if (this.langfuse?.isEnabled()) {
      trace = this.langfuse.createTrace({
        name: 'telegram_send_message',
        input: { chatId, content: content.substring(0, 100) + '...' },
        metadata: { platform: 'telegram', parseMode: options?.parseMode },
      });
      span = trace.span({
        name: 'telegram_api_call',
        input: { chatId, contentLength: content.length },
      });
    }

    try {
      await this.bot.api.sendMessage(chatId, content, {
        parse_mode: options?.parseMode === 'None' ? undefined : options?.parseMode || 'HTML',
      });

      // Update span with success
      if (span) {
        span.update({
          output: { success: true },
          metadata: { duration: Date.now() - startTime },
        });
        span.end();
      }
      if (trace) {
        trace.end();
      }
    } catch (error) {
      console.error(
        'Failed to send Telegram message:',
        redactSensitiveData({
          errorMessage: error instanceof Error ? error.message : String(error),
          chatId,
        }),
      );

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
      if (trace) {
        trace.end();
      }

      throw error;
    }
  }

  /**
   * Send a bulk message (for daily summaries) with higher rate limit
   * This bypasses the bot's rate limiting middleware and uses the bulk limiter instead
   */
  async sendBulkMessage(chatId: string, content: string): Promise<void> {
    await this.bulkLimiter.control(() =>
      this.bot.api.sendMessage(chatId, content, { parse_mode: 'HTML' })
    );
  }

  async validateWebhook(request: Request): Promise<boolean> {
    // In production, webhook secret is required
    const isProduction = env.get('DENO_ENV') === 'production';
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
      return timingSafeEqual(receivedToken, this.webhookSecret);
    }

    // Allow requests in development without secret (for local testing)
    return !isProduction;
  }

  async parseUpdate(request: Request): Promise<BotUpdate> {
    const body = (await request.json()) as any;
    // Telegram updates are complex, return minimal info
    return {
      platform: 'telegram',
      userId: body.message?.from?.id?.toString() || body.callback_query?.from?.id?.toString() || '',
      chatId: body.message?.chat?.id?.toString() ||
        body.callback_query?.message?.chat?.id?.toString() ||
        '',
      action: 'start', // Default, will be determined by handlers
      data: body,
    };
  }

  /**
   * Handle webhook using std/http mode (native Deno.serve() compatible)
   */
  handleWebhook(request: Request): Promise<Response> {
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
  getBot(): Bot<TelegramContext> {
    return this.bot;
  }
}
