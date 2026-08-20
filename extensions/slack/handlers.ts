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
  // Slack requires an acknowledgement within three seconds. Continue the agent request after responding.
  void processSlackMessage(body, deps);
  return jsonResponse({
    response_type: 'ephemeral',
    text: 'Đang xử lý yêu cầu của bạn...',
  });
}

async function processSlackMessage(
  body: Record<string, string>,
  deps: SlackExtensionDependencies,
): Promise<void> {
  const userId = body.user_id || '';
  try {
    const response = await deps.agent.stream(body.text || '', {
      sessionId: `slack_${userId}`,
      signal: AbortSignal.timeout(15000),
    });
    await sendSlackFollowup(body.response_url, {
      response_type: 'in_channel',
      text: response && response.trim() ? response : "Sorry, I couldn't process that.",
    });
  } catch (error) {
    logger.error('[SlackExtension] Agent processing failed', {
      message: error instanceof Error ? error.message : String(error),
      sessionId: `slack_${userId}`,
    });
    try {
      await sendSlackFollowup(body.response_url, {
        response_type: 'ephemeral',
        text: 'Sorry, something went wrong. Please try again.',
      });
    } catch (followupError) {
      logger.error('[SlackExtension] Failed to send follow-up response', {
        message: followupError instanceof Error ? followupError.message : String(followupError),
        sessionId: `slack_${userId}`,
      });
    }
  }
}

async function sendSlackFollowup(
  responseUrl: string | undefined,
  body: Record<string, unknown>,
): Promise<void> {
  if (!responseUrl) return;
  const url = new URL(responseUrl);
  if (url.hostname !== 'hooks.slack.com') {
    throw new Error('Slack response URL has an unexpected host');
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Slack response URL returned HTTP ${response.status}`);
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
