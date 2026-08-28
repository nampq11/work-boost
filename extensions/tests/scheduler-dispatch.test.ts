import { assertEquals, assertStringIncludes } from '@std/assert';
import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import { processDailySummary } from '@work-boost/extensions/scheduler/daily-job.ts';
import type { Logger } from '@work-boost/shared';

interface Subscription {
  enabled: string[];
  platforms: Record<string, string>;
}

function fakeDb(subscription: Subscription): Database {
  return {
    getRecentMessagesByUserId: () => Promise.resolve([{ content: 'finished the report' }]),
    getSubscriptionByUserId: () => Promise.resolve(subscription),
  } as unknown as Database;
}

function fakeAgent(): AgentPort {
  return {
    stream: () => Promise.resolve('Summary content'),
  } as unknown as AgentPort;
}

function spyLogger(warnMessages: string[]): Logger {
  return {
    info: () => {},
    debug: () => {},
    warn: (message: string) => {
      warnMessages.push(message);
    },
    error: () => {},
  } as unknown as Logger;
}

const noopLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

Deno.test('processDailySummary delivers to every enabled platform', async () => {
  const sent: Array<{ chatId: string; content: string }> = [];
  const messaging = {
    slack: {
      sendMessage: (chatId: string, content: string) => {
        sent.push({ chatId, content });
        return Promise.resolve();
      },
    },
    telegram: {
      sendMessage: (chatId: string, content: string) => {
        sent.push({ chatId, content });
        return Promise.resolve();
      },
    },
  };

  const result = await processDailySummary({
    db: fakeDb({ enabled: ['slack', 'telegram'], platforms: { slack: 'C1', telegram: 'T1' } }),
    agent: fakeAgent(),
    messaging,
    logger: noopLogger,
  });

  assertEquals(result.success, true);
  assertEquals(sent.length, 2);
  assertEquals(sent[0]?.chatId, 'C1');
  assertEquals(sent[1]?.chatId, 'T1');
});

Deno.test('processDailySummary reports failure when no platform delivers', async () => {
  const result = await processDailySummary({
    db: fakeDb({ enabled: ['telegram'], platforms: { telegram: 'T1' } }),
    agent: fakeAgent(),
    messaging: {
      telegram: {
        sendMessage: () => Promise.reject(new Error('delivery failed')),
      },
    },
    logger: noopLogger,
  });

  assertEquals(result.success, false);
  assertEquals(result.reason, 'all_platforms_failed');
});

Deno.test('processDailySummary warns when a subscribed platform has no connected sender', async () => {
  const warnings: string[] = [];
  const result = await processDailySummary({
    db: fakeDb({ enabled: ['telegram'], platforms: { telegram: 'T1' } }),
    agent: fakeAgent(),
    messaging: {},
    logger: spyLogger(warnings),
  });

  assertEquals(result.success, false);
  assertEquals(result.reason, 'all_platforms_failed');
  assertEquals(warnings.length, 1);
  assertStringIncludes(warnings[0], 'telegram');
});

Deno.test('processDailySummary stays silent for subscriptions without a chat id', async () => {
  const warnings: string[] = [];
  const result = await processDailySummary({
    db: fakeDb({ enabled: ['telegram'], platforms: {} }),
    agent: fakeAgent(),
    messaging: {},
    logger: spyLogger(warnings),
  });

  assertEquals(warnings.length, 0);
  assertEquals(result.success, false);
});
