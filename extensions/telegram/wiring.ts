import { autoRetry } from '@grammyjs/auto-retry';
import { limit } from '@grammyjs/ratelimiter';
import { stream, type StreamFlavor } from '@grammyjs/stream';
import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';
import { env, timingSafeEqual } from '@work-boost/shared';
import { logger, redactRecursively } from '@work-boost/shared/logger/logger.ts';
import { Bot, type Context, GrammyError } from 'grammy';
import * as debtHandlers from './handlers/debt/index.ts';
import * as handlers from './handlers/index.ts';
import { mainMenuKeyboard } from './keyboards.ts';
import { createSanitizationMiddleware } from './sanitizer.ts';

export type TelegramContext = StreamFlavor<Context>;

function getInteractiveRateLimit(): number {
  const parsed = Number(env.get('TELEGRAM_RATE_LIMIT_INTERACTIVE'));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 3;
}

/**
 * Register bot middleware: stream flavor, sanitization, owner authorization,
 * auto-retry, and an interactive-command rate limiter.
 */
export function setupTelegramMiddleware(bot: Bot<TelegramContext>): void {
  bot.use(stream());
  bot.use(createSanitizationMiddleware());

  const ownerId = env.get('TELEGRAM_OWNER_ID');
  bot.use(async (ctx, next) => {
    const senderId = ctx.from?.id.toString();
    if (!ownerId || !senderId || !timingSafeEqual(senderId, ownerId)) {
      logger.warn('Rejected unauthorized Telegram update');
      return;
    }
    await next();
  });

  bot.api.config.use(
    autoRetry({
      maxRetryAttempts: 3,
      maxDelaySeconds: 60,
    }),
  );

  bot.use(
    limit({
      timeFrame: 2000,
      limit: getInteractiveRateLimit(),
      onLimitExceeded: async (ctx) => {
        await ctx.reply('Please slow down! Try again in a few seconds.');
      },
    }),
  );
}

/**
 * Register all commands, callback queries, and the error catch-hook.
 */
export function registerTelegramHandlers(
  bot: Bot<TelegramContext>,
  deps: { db: Database; agent: AgentPort },
): void {
  bot.command('start', (ctx) => handlers.handleStart(ctx, deps));
  bot.command('subscribe', (ctx) => handlers.handleSubscribe(ctx, deps));
  bot.command('unsubscribe', (ctx) => handlers.handleUnsubscribe(ctx, deps));
  bot.command('status', (ctx) => handlers.handleStatus(ctx, deps));
  bot.command('help', (ctx) => handlers.handleHelp(ctx));

  bot.command('debt', (ctx) => debtHandlers.handleDebt(ctx, deps));
  bot.command('remind', (ctx) => debtHandlers.handleRemind(ctx, deps));

  bot.on('message:text', (ctx) => handlers.handleMessage(ctx, deps));

  bot.callbackQuery('action:subscribe', (ctx) => handlers.handleSubscribe(ctx, deps));
  bot.callbackQuery('action:unsubscribe', (ctx) => handlers.handleUnsubscribe(ctx, deps));
  bot.callbackQuery('action:unsubscribe_confirm', (ctx) =>
    handlers.handleUnsubscribeConfirm(ctx, deps),
  );
  bot.callbackQuery('action:status', (ctx) => handlers.handleStatus(ctx, deps));
  bot.callbackQuery('action:help', (ctx) => handlers.handleHelp(ctx));
  bot.callbackQuery('action:cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('Cancelled.', {
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.callbackQuery(/^action:debt:/, (ctx) => debtHandlers.handleDebtCallback(ctx, deps));

  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;

    logger.error('Telegram bot error', {
      details: redactRecursively({
        errorMessage: e instanceof Error ? e.message : String(e),
        errorCode: e instanceof GrammyError ? e.error_code : undefined,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
      }),
    });

    if (e instanceof GrammyError && e.error_code === 403 && ctx.from?.id) {
      deps.db
        .disablePlatform(SINGLE_USER_ID, 'telegram')
        .catch((error) => logger.error('Failed to disable telegram platform', { error }));
    }
  });
}
