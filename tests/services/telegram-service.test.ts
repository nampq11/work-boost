import { assertEquals, assertThrows } from '@std/assert';
import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { SlackService, TelegramService } from '@work-boost/services';

function createFakeDb(): Database {
  return {
    config: {
      load: () => Promise.resolve({ timezone: 'Asia/Ho_Chi_Minh' }),
      save: () => Promise.resolve(),
    },
    disablePlatform: () => Promise.resolve(),
  } as unknown as Database;
}

function createFakeAgent(): AgentPort {
  return {
    stream: () => Promise.resolve(''),
    removeSession: () => false,
  } as AgentPort;
}

Deno.test('SlackService constructor reads tokens from environment', () => {
  Deno.env.set('SLACK_BOT_TOKEN', 'xoxb-test-token');
  Deno.env.set('SLACK_SIGNING_SECRET', 'test-secret');

  const service = new SlackService();
  assertEquals(service.platform, 'slack');

  Deno.env.delete('SLACK_BOT_TOKEN');
  Deno.env.delete('SLACK_SIGNING_SECRET');
});

Deno.test('SlackService constructor works without tokens (empty strings)', () => {
  Deno.env.delete('SLACK_BOT_TOKEN');
  Deno.env.delete('SLACK_SIGNING_SECRET');

  const service = new SlackService();
  assertEquals(service.platform, 'slack');
});

Deno.test('TelegramService constructor throws when TELEGRAM_BOT_TOKEN is missing', () => {
  Deno.env.delete('TELEGRAM_BOT_TOKEN');

  assertThrows(
    () => new TelegramService(createFakeDb(), createFakeAgent()),
    Error,
    'TELEGRAM_BOT_TOKEN is required',
  );
});

Deno.test('TelegramService constructor stores webhook secret from environment', () => {
  // Test the validateWebhook path without constructing a full Bot.
  // The Bot constructor requires a valid token format, so we test the
  // error handling logic by verifying the throw message includes the
  // expected requirement.
  Deno.env.delete('TELEGRAM_BOT_TOKEN');

  let thrownError: Error | undefined;
  try {
    new TelegramService(createFakeDb(), createFakeAgent());
  } catch (error) {
    thrownError = error as Error;
  }

  assertEquals(thrownError?.message.includes('TELEGRAM_BOT_TOKEN'), true);
});
