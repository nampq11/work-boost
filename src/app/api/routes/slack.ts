import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { Subscription } from '../../../entity/subscription.ts';
import type { Agent, Database } from '../../../services/_index.ts';
import type { Slack } from '../../../services/slack/slack.ts';
import type { TelegramService } from '../../../services/telegram/telegram.ts';

export interface SlackDeps {
  db: Database;
  agent: Agent;
  slack: Slack;
  telegram: TelegramService;
}

/**
 * Attach Slack dependencies to request object
 */
export function attachSlackDeps(deps: SlackDeps) {
  return (req: ExpressRequest, _res: ExpressResponse, next: () => void) => {
    (req as any).slackDeps = deps;
    next();
  };
}

/**
 * Handle Slack subscribe command
 */
export async function handleSlackSubscribe(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const deps = (req as any).slackDeps as SlackDeps;

  // Parse Slack request body
  const body = req.body as any;
  const userId = body.user_id || '';

  // Get existing subscription
  const existing = await deps.db.getSubscriptionByUserId(userId);

  if (existing) {
    // Update existing subscription
    await deps.db.setPlatformChatId(userId, 'slack', userId);
    if (!existing.enabled.includes('slack')) {
      existing.enabled.push('slack');
      await deps.db.upsertSubscription(existing);
    }
  } else {
    // Create new subscription
    const newSubscription: Subscription = {
      userId,
      platforms: { slack: userId },
      enabled: ['slack'],
      subscribedAt: new Date(),
    };
    await deps.db.upsertSubscription(newSubscription);
  }

  res.status(200).json({
    response_type: 'ephemeral',
    text: 'Oke rồi, mình sẽ thông báo cho bạn mỗi sáng! 🚀',
  });
}

/**
 * Handle Slack unsubscribe command
 */
export async function handleSlackUnsubscribe(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const deps = (req as any).slackDeps as SlackDeps;

  // Parse Slack request body
  const body = req.body as any;
  const userId = body.user_id || '';

  // Unsubscribe user from Slack only (leaves Telegram active if subscribed)
  await deps.db.disablePlatform(userId, 'slack');

  res.status(200).json({
    response_type: 'ephemeral',
    text: 'Oke rồi, mình sẽ không thông báo cho bạn nữa! 👋',
  });
}

/**
 * Handle Slack messages command
 */
export async function handleSlackMessages(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const deps = (req as any).slackDeps as SlackDeps;

  // Parse Slack request body
  const body = req.body as any;
  const userId = body.user_id || '';
  const text = body.text || '';

  // Get agent response
  const response = await deps.agent.query(text, userId);

  // Send formatted response
  res.status(200).json({
    response_type: 'in_channel',
    text: deps.slack.formatToSlack(response),
  });
}
