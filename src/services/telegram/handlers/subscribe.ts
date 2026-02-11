import type { Context } from 'grammy';
import type { Subscription } from '../../../entity/subscription.ts';
import type { Database } from '../../../services/database/database.ts';
import { mainMenuKeyboard } from '../keyboards.ts';

interface SubscribeHandlerDeps {
  db: Database;
  subscription: Subscription;
}

/**
 * Handle /subscribe command or subscribe button
 * Works for both commands and callback queries
 */
export async function handleSubscribe(ctx: Context, deps: SubscribeHandlerDeps): Promise<void> {
  // Answer callback query if this is a button press (required to remove loading state)
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }

  const chatId = ctx.chat?.id?.toString();
  const fromId = ctx.from?.id.toString();

  if (!chatId || !fromId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  // Check if already subscribed to Telegram
  const existing = await deps.db.getSubscriptionByUserId(fromId);
  const isSubscribed = existing?.enabled.includes('telegram');

  if (isSubscribed) {
    const replyFn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn('You are already subscribed to daily summaries! 😊', {
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  // Create or update subscription
  await deps.db.upsertSubscription({
    userId: fromId,
    platforms: existing?.platforms || {},
    enabled: [...(existing?.enabled || []), 'telegram'],
    timezone: existing?.timezone,
    subscribedAt: existing?.subscribedAt || new Date(),
  });

  // Update platform chat ID
  await deps.db.setPlatformChatId(fromId, 'telegram', chatId);

  const replyFn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await replyFn(
    "Oke rồi, mình sẽ thông báo cho bạn mỗi sáng! 😊\n\nYou'll receive daily work summaries.",
    { reply_markup: mainMenuKeyboard() },
  );
}

/**
 * @deprecated Use handleSubscribe directly - it now handles both commands and callbacks
 * Kept for backwards compatibility
 */
export async function handleSubscribeCallback(
  ctx: Context,
  deps: SubscribeHandlerDeps,
): Promise<void> {
  await handleSubscribe(ctx, deps);
}
