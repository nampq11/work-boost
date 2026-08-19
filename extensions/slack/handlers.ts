import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider/database.ts';
import type { Subscription } from '@work-boost/data-schemas/subscription.ts';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { SlackService } from './slack.ts';

export interface SlackExtensionDependencies {
  db: Database;
  agent: AgentPort;
  slack: SlackService;
}

export async function handleSlackSubscribe(
  body: Record<string, string>,
  deps: SlackExtensionDependencies,
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

  return jsonResponse({
    response_type: 'ephemeral',
    text: 'Oke rồi, mình sẽ thông báo cho bạn mỗi sáng! 🚀',
  });
}

export async function handleSlackUnsubscribe(
  body: Record<string, string>,
  deps: SlackExtensionDependencies,
): Promise<Response> {
  await deps.db.disablePlatform(body.user_id || '', 'slack');
  return jsonResponse({
    response_type: 'ephemeral',
    text: 'Oke rồi, mình sẽ không thông báo cho bạn nữa! 👋',
  });
}

export async function handleSlackMessages(
  body: Record<string, string>,
  deps: SlackExtensionDependencies,
): Promise<Response> {
  const userId = body.user_id || '';
  try {
    const response = await deps.agent.stream(body.text || '', {
      sessionId: `slack_${userId}`,
      signal: AbortSignal.timeout(15000),
    });

    return jsonResponse({
      response_type: 'in_channel',
      text: response && response.trim() ? response : "Sorry, I couldn't process that.",
    });
  } catch (error) {
    logger.error('[SlackExtension] Agent processing failed', {
      error,
      sessionId: `slack_${userId}`,
    });
    return jsonResponse({
      response_type: 'ephemeral',
      text: 'Sorry, something went wrong. Please try again.',
    });
  }
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
