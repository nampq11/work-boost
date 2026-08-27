import { assertEquals } from '@std/assert';
import { isPlatformEnabled, getActivePlatforms } from '../src/subscription.ts';
import type { Subscription } from '../src/subscription.ts';

Deno.test('isPlatformEnabled - returns true when platform is enabled and has an ID', () => {
  const subscription: Subscription = {
    userId: 'user-1',
    platforms: {
      slack: 'slack-id-1',
    },
    enabled: ['slack'],
    subscribedAt: new Date(),
  };
  assertEquals(isPlatformEnabled(subscription, 'slack'), true);
});

Deno.test('isPlatformEnabled - returns false when platform is enabled but missing an ID', () => {
  const subscription: Subscription = {
    userId: 'user-1',
    platforms: {
      slack: undefined,
    },
    enabled: ['slack'],
    subscribedAt: new Date(),
  };
  assertEquals(isPlatformEnabled(subscription, 'slack'), false);
});

Deno.test('isPlatformEnabled - returns false when platform has an ID but is not enabled', () => {
  const subscription: Subscription = {
    userId: 'user-1',
    platforms: {
      slack: 'slack-id-1',
    },
    enabled: [],
    subscribedAt: new Date(),
  };
  assertEquals(isPlatformEnabled(subscription, 'slack'), false);
});

Deno.test('isPlatformEnabled - returns false when platform has empty string ID', () => {
  const subscription: Subscription = {
    userId: 'user-1',
    platforms: {
      slack: '',
    },
    enabled: ['slack'],
    subscribedAt: new Date(),
  };
  assertEquals(isPlatformEnabled(subscription, 'slack'), false);
});

Deno.test('getActivePlatforms - returns empty array when no platforms enabled', () => {
  const subscription: Subscription = {
    userId: 'user-1',
    platforms: {
      slack: 'slack-id-1',
    },
    enabled: [],
    subscribedAt: new Date(),
  };
  assertEquals(getActivePlatforms(subscription), []);
});

Deno.test('getActivePlatforms - returns only platforms that are enabled and have an ID', () => {
  const subscription: Subscription = {
    userId: 'user-1',
    platforms: {
      slack: 'slack-id-1',
      telegram: 'telegram-id-1',
    },
    enabled: ['slack', 'telegram'],
    subscribedAt: new Date(),
  };
  assertEquals(getActivePlatforms(subscription), ['slack', 'telegram']);
});

Deno.test('getActivePlatforms - ignores platforms that are enabled but lack a valid ID', () => {
  const subscription: Subscription = {
    userId: 'user-1',
    platforms: {
      slack: 'slack-id-1',
      telegram: '', // empty ID should be ignored
    },
    enabled: ['slack', 'telegram'],
    subscribedAt: new Date(),
  };
  assertEquals(getActivePlatforms(subscription), ['slack']);
});
