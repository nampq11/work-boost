import type { WorkBoostExtension } from '../types.ts';
import { TelegramService } from './telegram.ts';

export function telegramExtension(): WorkBoostExtension {
  let service: TelegramService | undefined;

  return {
    name: 'telegram',
    version: '1.0.0',

    init(ctx) {
      service = new TelegramService(ctx.db, ctx.agent);
      ctx.messaging = { ...ctx.messaging, telegram: service };
    },

    registerRoutes(router) {
      router.post('/telegram', async (request) => {
        if (!service) return new Response('Telegram extension is not initialized', { status: 503 });
        if (!(await service.validateWebhook(request))) {
          return new Response('Unauthorized', { status: 401 });
        }
        return service.handleWebhook(request);
      });
    },

    dispose() {
      return service?.stop();
    },
  };
}
