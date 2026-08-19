import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Subscription } from '@work-boost/data-schemas/subscription.ts';
import type { Context } from 'grammy';
import { mainMenuKeyboard } from '../keyboards.ts';

interface SubscribeHandlerDeps {
  db: Database;
  agent: AgentPort;
}

/**
 * Handle /subscribe command or subscribe button
 * Updated for single-user system (Phase 1: Local-First Architecture)
 */
export async function handleSubscribe(ctx: Context, deps: SubscribeHandlerDeps): Promise<void> {
  // Answer callback query if this is a button press (required to remove loading state)
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }

  const chatId = ctx.chat?.id?.toString();

  if (!chatId) {
    await ctx.reply('Unable to identify chat. Please try again.');
    return;
  }

  // Check if already subscribed to Telegram (single-user system)
  const existing = await deps.db.getSubscriptionByUserId('workspace-user');
  const isSubscribed = existing?.enabled.includes('telegram');

  if (isSubscribed) {
    const replyFn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    await replyFn('You are already subscribed to daily summaries! 😊', {
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  // Create or update subscription for single-user system
  await deps.db.upsertSubscription({
    userId: 'workspace-user', // Single-user system
    platforms: existing?.platforms || {},
    enabled: [...(existing?.enabled || []), 'telegram'],
    timezone: existing?.timezone,
    subscribedAt: existing?.subscribedAt || new Date(),
  });

  // Update platform chat ID for workspace user
  await deps.db.setPlatformChatId('workspace-user', 'telegram', chatId);

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
