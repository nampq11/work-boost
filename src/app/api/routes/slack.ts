import type { Subscription } from '../../../core/entity/subscription.ts';
import type { Agent, Database } from '../../../core/services/index.ts';
import type { Slack } from '../../../core/services/slack/slack.ts';

export interface SlackDeps {
  db: Database;
  agent: Agent;
  slack: Slack;
}

/**
 * Handle Slack subscribe command
 */
export async function handleSlackSubscribe(
  body: Record<string, string>,
  deps: SlackDeps,
): Promise<Response> {
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

  return new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: 'Oke rồi, mình sẽ thông báo cho bạn mỗi sáng! 🚀',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

/**
 * Handle Slack unsubscribe command
 */
export async function handleSlackUnsubscribe(
  body: Record<string, string>,
  deps: SlackDeps,
): Promise<Response> {
  const userId = body.user_id || '';

  // Unsubscribe user from Slack only (leaves Telegram active if subscribed)
  await deps.db.disablePlatform(userId, 'slack');

  return new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: 'Oke rồi, mình sẽ không thông báo cho bạn nữa! 👋',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

/**
 * Handle Slack messages command
 */
export async function handleSlackMessages(
  body: Record<string, string>,
  deps: SlackDeps,
): Promise<Response> {
  const text = body.text || '';
  const userId = body.user_id || '';
  const sessionId = `slack_${userId}`;

  // Get agent response with streaming support
  const result = await deps.agent.stream(
    text,
    async (_chunk) => {
      // Slack doesn't support real-time streaming in responses
      // We accumulate and send the final response
    },
    { sessionId, platform: 'slack', chatId: userId },
  );

  // Send formatted response
  return new Response(
    JSON.stringify({
      response_type: 'in_channel',
      text: result.success && result.content ? result.content : 'Sorry, I couldn\'t process that.',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}
