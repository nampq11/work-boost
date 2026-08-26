import { assertEquals } from '@std/assert';
import { Database, SINGLE_USER_ID } from '@work-boost/data-provider/database.ts';

Deno.test('storeDailyWorkMessage appends instead of overwriting the same day', async () => {
  const db = await Database.createForTest();

  await db.storeDailyWorkMessage({
    id: crypto.randomUUID(),
    userId: SINGLE_USER_ID,
    content: 'first update',
    date: new Date('2026-02-01T10:00:00Z'),
  });
  await db.storeDailyWorkMessage({
    id: crypto.randomUUID(),
    userId: SINGLE_USER_ID,
    content: 'second update',
    date: new Date('2026-02-01T15:00:00Z'),
  });

  const stored = await db.getDailyWork(SINGLE_USER_ID, new Date('2026-02-01T12:00:00Z'));
  assertEquals(stored?.content.includes('first update'), true);
  assertEquals(stored?.content.includes('second update'), true);
  await db.close();
});
