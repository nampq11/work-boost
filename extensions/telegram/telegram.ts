import { autoRetry } from '@grammyjs/auto-retry';
import { limit } from '@grammyjs/ratelimiter';
import { stream, type StreamFlavor } from '@grammyjs/stream';
import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { env } from '@work-boost/shared';
import { Bot, type Context, GrammyError } from 'grammy';
import { webhookCallback } from 'grammy';
import type { BotService, BotUpdate, Platform, SendOptions } from '../bot/bot-service.ts';
import { handleDebtInput, hasPendingDebt } from './handlers/debt/debt.ts';
import * as debtHandlers from './handlers/debt/index.ts';
import * as handlers from './handlers/index.ts';
import { mainMenuKeyboard } from './keyboards.ts';
import { createSanitizationMiddleware } from './sanitizer.ts';

export type TelegramContext = StreamFlavor<Context>;

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
 * Simple sliding-window rate limiter for bulk message sending.
 * Replaces @grammyjs/ratelimiter's limit() middleware which returns grammY
 * middleware, not an object with control().
 */
class BulkLimiter {
  private maxRequests: number;
  private timeFrame: number;
  private timestamps: number[] = [];

  constructor(maxRequests: number, timeFrame: number) {
    this.maxRequests = maxRequests;
    this.timeFrame = timeFrame;
  }

  async control<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.timeFrame);
    if (this.timestamps.length >= this.maxRequests) {
      const waitTime = this.timeFrame - (now - this.timestamps[0]);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.control(fn);
      }
    }
    this.timestamps.push(now);
    return fn();
  }
}

function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['token', 'password', 'secret', 'apiKey', 'botToken'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const shouldRedact = sensitiveKeys.some((sensitive) => keyLower === sensitive.toLowerCase());

    if (shouldRedact && typeof value === 'string' && value.length > 0) {
      result[key] = '[REDACTED]';
    } else if (shouldRedact && typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function getRateLimit(type: 'interactive' | 'bulk'): number {
  if (type === 'interactive') {
    const limitStr = env.get('TELEGRAM_RATE_LIMIT_INTERACTIVE');
    return limitStr ? parseInt(limitStr, 10) : 3;
  } else {
    const limitStr = env.get('TELEGRAM_RATE_LIMIT_BULK');
    return limitStr ? parseInt(limitStr, 10) : 25;
  }
}

export class TelegramService implements BotService {
  readonly platform: Platform = 'telegram';
  private bot: Bot<TelegramContext>;
  private db: Database;
  private agent: AgentPort;
  private webhookSecret: string;
  private bulkLimiter: BulkLimiter;

  constructor(db: Database, agent: AgentPort) {
    const token = env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.webhookSecret = env.get('TELEGRAM_WEBHOOK_SECRET') || '';
    this.db = db;
    this.agent = agent;
    this.bot = new Bot<TelegramContext>(token);

    this.bulkLimiter = new BulkLimiter(getRateLimit('bulk'), 1000);

    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    this.bot.use(stream());
    this.bot.use(createSanitizationMiddleware());

    const ownerId = env.get('TELEGRAM_OWNER_ID');
    this.bot.use(async (ctx, next) => {
      const senderId = ctx.from?.id.toString();
      if (!ownerId || !senderId || !timingSafeEqual(senderId, ownerId)) {
        console.warn('Rejected unauthorized Telegram update');
        return;
      }
      await next();
    });

    this.bot.api.config.use(
      autoRetry({
        maxRetryAttempts: 3,
        maxDelaySeconds: 60,
      }),
    );

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

    this.bot.command('start', (ctx) => handlers.handleStart(ctx));
    this.bot.command('subscribe', (ctx) => handlers.handleSubscribe(ctx, deps));
    this.bot.command('unsubscribe', (ctx) => handlers.handleUnsubscribe(ctx, deps));
    this.bot.command('status', (ctx) => handlers.handleStatus(ctx, deps));
    this.bot.command('help', (ctx) => handlers.handleHelp(ctx));

    this.bot.command('debt', (ctx) => debtHandlers.handleDebt(ctx, deps));
    this.bot.command('d', (ctx) => debtHandlers.handleDebt(ctx, deps));
    this.bot.command('debts', (ctx) => debtHandlers.handleListDebts(ctx, deps));
    this.bot.command('dlist', (ctx) => debtHandlers.handleListDebts(ctx, deps));
    this.bot.command('settle', (ctx) => debtHandlers.handleSettleCommand(ctx, deps));
    this.bot.command('delete', async (ctx) => {
      const userId = ctx.from?.id.toString();
      if (userId && hasPendingDebt(userId)) {
        await debtHandlers.handleDeleteCommand(ctx, deps);
      }
    });
    this.bot.command('debtsummary', (ctx) => debtHandlers.handleDebtSummary(ctx, deps));
    this.bot.command('dsummary', (ctx) => debtHandlers.handleDebtSummary(ctx, deps));
    this.bot.command('remind', (ctx) => debtHandlers.handleRemind(ctx, deps));

    this.bot.on('message:text', async (ctx) => {
      const userId = ctx.from?.id.toString();
      const messageText = ctx.message?.text || '';

      if (userId && hasPendingDebt(userId)) {
        const handled = await handleDebtInput(ctx, deps, messageText);
        if (handled) return;
      }

      await handlers.handleMessage(ctx, deps);
    });

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

    this.bot.callbackQuery(/^action:debt:/, (ctx) => debtHandlers.handleDebtCallback(ctx, deps));

    this.bot.catch((err) => {
      const ctx = err.ctx;
      const e = err.error;

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

  async sendBulkMessage(chatId: string, content: string): Promise<void> {
    await this.bulkLimiter.control(() =>
      this.bot.api.sendMessage(chatId, content, { parse_mode: 'HTML' }),
    );
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

  async parseUpdate(request: Request): Promise<BotUpdate> {
    const body = (await request.json()) as any;
    return {
      platform: 'telegram',
      userId: body.message?.from?.id?.toString() || body.callback_query?.from?.id?.toString() || '',
      chatId:
        body.message?.chat?.id?.toString() ||
        body.callback_query?.message?.chat?.id?.toString() ||
        '',
      action: 'start',
      data: body,
    };
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
