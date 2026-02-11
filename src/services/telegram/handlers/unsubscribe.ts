import type { Context } from 'grammy';
import type { Database } from '../../../services/database/database.ts';
import { mainMenuKeyboard, unsubscribeConfirmKeyboard } from '../keyboards.ts';

interface UnsubscribeHandlerDeps {
  db: Database;
}

/**
 * Handle /unsubscribe command - show confirmation
 */
export async function handleUnsubscribe(ctx: Context, deps: UnsubscribeHandlerDeps): Promise<void> {
  const fromId = ctx.from?.id.toString();

  if (!fromId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  const existing = await deps.db.getSubscriptionByUserId(fromId);

  if (!existing || !existing.enabled.includes('telegram')) {
    await ctx.reply("You're not subscribed to daily summaries.", {
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  // Check if also subscribed to Slack
  const hasSlack = existing.enabled.includes('slack');

  const message = hasSlack
    ? 'You are subscribed to both Slack and Telegram.\n\nUnsubscribe from Telegram only?'
    : 'Are you sure you want to unsubscribe?';

  await ctx.reply(message, {
    reply_markup: unsubscribeConfirmKeyboard(),
  });
}

/**
 * Handle confirmed unsubscribe action
 */
export async function handleUnsubscribeConfirm(
  ctx: Context,
  deps: UnsubscribeHandlerDeps,
): Promise<void> {
  const fromId = ctx.from?.id.toString();

  if (!fromId) {
    await ctx.reply('Unable to identify user. Please try again.');
    return;
  }

  const existing = await deps.db.getSubscriptionByUserId(fromId);

  if (existing) {
    // Remove only telegram from enabled platforms
    const enabled = existing.enabled.filter((p) => p !== 'telegram');
    await deps.db.upsertSubscription({
      ...existing,
      enabled,
    });
  }

  await ctx.reply(
    "Oke rồi, mình sẽ không thông báo cho bạn nữa! 😊\n\nYou've been unsubscribed from Telegram notifications.",
    { reply_markup: mainMenuKeyboard() },
  );
}

/**
 * Handle callback query for unsubscribe action
 */
export async function handleUnsubscribeCallback(
  ctx: Context,
  deps: UnsubscribeHandlerDeps,
): Promise<void> {
  await ctx.answerCallbackQuery();
  await handleUnsubscribe(ctx, deps);
}
