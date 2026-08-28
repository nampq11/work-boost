import { assertEquals, assertStringIncludes } from '@std/assert';
import { parseEnv } from '@work-boost/shared/env.ts';

function withSilencedConsole<T>(action: () => T): T {
  const originalError = console.error;
  console.error = () => {};
  try {
    return action();
  } finally {
    console.error = originalError;
  }
}

Deno.test('parseEnv applies defaults when no variables are set', () => {
  const parsed = withSilencedConsole(() => parseEnv({}));
  assertEquals(parsed.DENO_ENV, 'development');
  assertEquals(parsed.LOG_LEVEL, 'info');
  assertEquals(parsed.REDACT_SECRETS, true);
});

Deno.test('parseEnv keeps valid values', () => {
  const parsed = withSilencedConsole(() =>
    parseEnv({ DENO_ENV: 'production', LOG_LEVEL: 'debug', REDACT_SECRETS: 'true' }),
  );
  assertEquals(parsed.DENO_ENV, 'production');
  assertEquals(parsed.LOG_LEVEL, 'debug');
  assertEquals(parsed.REDACT_SECRETS, true);
});

Deno.test('parseEnv normalizes the legacy developement misspelling', () => {
  const parsed = withSilencedConsole(() => parseEnv({ DENO_ENV: 'developement' }));
  assertEquals(parsed.DENO_ENV, 'development');
});

Deno.test('parseEnv disables redaction only for the literal false', () => {
  assertEquals(
    withSilencedConsole(() => parseEnv({ REDACT_SECRETS: 'false' })).REDACT_SECRETS,
    false,
  );
  assertEquals(withSilencedConsole(() => parseEnv({ REDACT_SECRETS: '0' })).REDACT_SECRETS, true);
});

Deno.test('parseEnv falls back to defaults on invalid values and reports why', () => {
  let reported = '';
  const originalError = console.error;
  console.error = (message: unknown) => {
    reported = String(message);
  };
  try {
    const parsed = parseEnv({ DENO_ENV: 'staging', LOG_LEVEL: 'loud' });
    assertEquals(parsed.DENO_ENV, 'development');
    assertEquals(parsed.LOG_LEVEL, 'info');
    assertEquals(parsed.REDACT_SECRETS, true);
  } finally {
    console.error = originalError;
  }
  assertStringIncludes(reported, 'Environment validation failed');
});
