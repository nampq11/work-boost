import { assertEquals } from '@std/assert';
import { createExpiringStore } from '@work-boost/extensions/telegram/state.ts';

Deno.test('expiring store removes values after its TTL', async () => {
  const store = createExpiringStore<string>(10);

  try {
    store.set('user-1', 'pending');
    assertEquals(store.get('user-1'), 'pending');

    await new Promise((resolve) => setTimeout(resolve, 20));

    assertEquals(store.get('user-1'), undefined);
    assertEquals(store.has('user-1'), false);
  } finally {
    store.clear();
  }
});
