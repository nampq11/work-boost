import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider/database.ts';
import type { Subscription } from '@work-boost/data-schemas/subscription.ts';
import type { SlackService } from '@work-boost/services/slack/slack.ts';
import { logger } from '@work-boost/shared/logger/logger.ts';

export interface SlackDeps {
  db: Database;
  agent: AgentPort;
  slack: SlackService;
}

export async function handleSlackSubscribe(
  body: Record<string, string>,
  deps: SlackDeps,
): Promise<Response> {
  const userId = body.user_id || '';

  const existing = await deps.db.getSubscriptionByUserId(userId);

  if (existing) {
    await deps.db.setPlatformChatId(userId, 'slack', userId);
    if (!existing.enabled.includes('slack')) {
      existing.enabled.push('slack');
      await deps.db.upsertSubscription(existing);
    }
  } else {
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

export async function handleSlackUnsubscribe(
  body: Record<string, string>,
  deps: SlackDeps,
): Promise<Response> {
  const userId = body.user_id || '';

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

export async function handleSlackMessages(
  body: Record<string, string>,
  deps: SlackDeps,
): Promise<Response> {
  const text = body.text || '';
  const userId = body.user_id || '';
  const sessionId = `slack_${userId}`;

  try {
    const response = await deps.agent.stream(text, {
      sessionId,
      signal: AbortSignal.timeout(15000),
    });

    return new Response(
      JSON.stringify({
        response_type: 'in_channel',
        text: response && response.trim() ? response : "Sorry, I couldn't process that.",
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('[handleSlackMessages] agent.stream failed', {
      error: errorMsg,
      sessionId,
    });
    return new Response(
      JSON.stringify({
        response_type: 'ephemeral',
        text: 'Sorry, something went wrong. Please try again.',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }
}
