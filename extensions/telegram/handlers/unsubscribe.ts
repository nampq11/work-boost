import { type Database, SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';
import type { Context } from 'grammy';
import { mainMenuKeyboard, unsubscribeConfirmKeyboard } from '../keyboards.ts';

interface UnsubscribeHandlerDeps {
  db: Database;
}

/**
 * Handle /unsubscribe command - show confirmation
 */
export async function handleUnsubscribe(ctx: Context, deps: UnsubscribeHandlerDeps): Promise<void> {
  // Answer callback query if this is a button press
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }

  // Single-user system: all subscription methods operate on the workspace user.
  const existing = await deps.db.getSubscriptionByUserId(SINGLE_USER_ID);

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
  // Answer callback query if this is a button press
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }

  // Single-user system: all subscription methods operate on the workspace user.
  const existing = await deps.db.getSubscriptionByUserId(SINGLE_USER_ID);

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
