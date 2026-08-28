import { assertEquals } from '@std/assert';
import { resolveRateLimit } from '@work-boost/api/main.ts';

function withEnv(name: string, value: string | undefined, action: () => void): void {
  const original = Deno.env.get(name);
  try {
    if (value === undefined) {
      Deno.env.delete(name);
    } else {
      Deno.env.set(name, value);
    }
    action();
  } finally {
    if (original === undefined) {
      Deno.env.delete(name);
    } else {
      Deno.env.set(name, original);
    }
  }
}

const DEFAULTS = { maxRequests: 100, windowMs: 15 * 60 * 1000 };

Deno.test('resolveRateLimit keeps defaults when no env vars are set', () => {
  withEnv('WORKBOOST_RATE_LIMIT_MAX', undefined, () => {
    withEnv('WORKBOOST_RATE_LIMIT_WINDOW_MS', undefined, () => {
      assertEquals(resolveRateLimit(DEFAULTS), DEFAULTS);
    });
  });
});

Deno.test('resolveRateLimit accepts positive integer overrides', () => {
  withEnv('WORKBOOST_RATE_LIMIT_MAX', '250', () => {
    withEnv('WORKBOOST_RATE_LIMIT_WINDOW_MS', '60000', () => {
      assertEquals(resolveRateLimit(DEFAULTS), { maxRequests: 250, windowMs: 60000 });
    });
  });
});

Deno.test('resolveRateLimit falls back to defaults on invalid values', () => {
  withEnv('WORKBOOST_RATE_LIMIT_MAX', 'not-a-number', () => {
    withEnv('WORKBOOST_RATE_LIMIT_WINDOW_MS', '-5', () => {
      assertEquals(resolveRateLimit(DEFAULTS), DEFAULTS);
    });
  });
});
