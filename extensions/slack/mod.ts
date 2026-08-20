import { env } from '@work-boost/shared';
import type { WorkBoostExtension } from '../types.ts';
import { handleSlackMessages, handleSlackSubscribe, handleSlackUnsubscribe } from './handlers.ts';
import { SlackService } from './slack.ts';
import { validateSlackWebhook } from './validation.ts';

const ROUTES = new Set(['/subscribe', '/unsubscribe', '/messages']);

export function slackExtension(): WorkBoostExtension {
  let service: SlackService | undefined;
  let dependencies: Parameters<typeof handleSlackMessages>[1] | undefined;

  return {
    name: 'slack',
    version: '1.0.0',

    init(ctx) {
      service = new SlackService();
      dependencies = { db: ctx.db, agent: ctx.agent, slack: service };
      ctx.messaging = { ...ctx.messaging, slack: service };
    },

    registerRoutes(router) {
      for (const path of ROUTES) {
        router.post(path, async (request) => {
          if (!service || !dependencies) {
            return new Response('Slack extension is not initialized', { status: 503 });
          }

          const validation = await validateSlackWebhook(
            request,
            env.get('SLACK_SIGNING_SECRET') || '',
          );
          if (validation.error) return validation.error;

          const body = parseSlackBody(validation.bodyString, request.headers.get('content-type'));
          if (!body) return new Response('Invalid request body', { status: 400 });

          if (path === '/subscribe') return handleSlackSubscribe(body, dependencies);
          if (path === '/unsubscribe') return handleSlackUnsubscribe(body, dependencies);
          return handleSlackMessages(body, dependencies);
        });
      }
    },
  };
}

function parseSlackBody(
  bodyString: string,
  contentType: string | null,
): Record<string, string> | null {
  try {
    if (contentType?.includes('application/json') || bodyString.trimStart().startsWith('{')) {
      const parsed = JSON.parse(bodyString);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : null;
    }

    return Object.fromEntries(
      new URLSearchParams(bodyString) as unknown as Iterable<[string, string]>,
    );
  } catch {
    return null;
  }
}
