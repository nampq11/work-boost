import { assertEquals, assertExists } from '@std/assert';
import { Database } from '@work-boost/data-provider';
import { DebtDirection, DebtStatus } from '@work-boost/data-schemas/debt.ts';
import { Message } from '@work-boost/data-schemas/task.ts';
import { User } from '@work-boost/data-schemas/user.ts';

async function withTestDatabase(test: (db: Database) => Promise<void>): Promise<void> {
  const db = await Database.createForTest();
  try {
    await test(db);
  } finally {
    db.kv.close();
  }
}

Deno.test('Database stores, loads, filters, and deletes users', async () => {
  await withTestDatabase(async (db) => {
    const subscribedUser: User = {
      id: 'user-1',
      username: 'subscribed',
      subscribed: true,
    };
    const unsubscribedUser: User = {
      id: 'user-2',
      username: 'unsubscribed',
      subscribed: false,
    };

    await db.store(subscribedUser);
    await db.store(unsubscribedUser);

    assertEquals(await db.getById('user-1'), subscribedUser);
    assertEquals(await db.getAllSubscribedUsers(), [subscribedUser]);

    await db.delete('user-1');
    assertEquals(await db.getById('user-1'), null);
  });
});

Deno.test('Database retrieves daily work by indexed user messages and exact calendar date', async () => {
  await withTestDatabase(async (db) => {
    const januaryMessage: Message = {
      id: 'message-jan',
      userId: 'user-1',
      content: 'January work',
      date: new Date('2026-01-05T10:00:00Z'),
    };
    const februaryMessage: Message = {
      id: 'message-feb',
      userId: 'user-1',
      content: 'February work',
      date: new Date('2026-02-05T10:00:00Z'),
    };

    await db.storeDailyWorkMessage(januaryMessage);
    await db.storeDailyWorkMessage(februaryMessage);

    assertEquals(await db.getMessagesByUserId('user-1'), [januaryMessage, februaryMessage]);
    assertEquals(
      await db.getDailyWork('user-1', new Date('2026-02-05T11:00:00Z')),
      februaryMessage,
    );
    assertEquals(await db.getDailyWork('user-1', new Date('2026-03-05T10:00:00Z')), undefined);
  });
});

Deno.test('Database maintains active subscription indexes', async () => {
  await withTestDatabase(async (db) => {
    await db.upsertSubscription({
      userId: 'active-user',
      platforms: { telegram: 'chat-1' },
      enabled: ['telegram'],
      subscribedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.upsertSubscription({
      userId: 'inactive-user',
      platforms: { telegram: 'chat-2' },
      enabled: [],
      subscribedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const activeSubscriptions = await db.getAllActiveSubscriptions();

    assertEquals(
      activeSubscriptions.map((subscription) => subscription.userId),
      ['active-user'],
    );
  });
});

Deno.test('Database keeps debt primary, unpaid, and summary indexes consistent', async () => {
  await withTestDatabase(async (db) => {
    const debt = await db.createDebt({
      userId: 'user-1',
      direction: DebtDirection.LENT,
      amount: 100,
      currency: 'USD',
      personName: 'Alex',
      status: DebtStatus.PENDING,
    });

    assertExists(await db.getDebtById(debt.id));
    assertEquals(
      (await db.getDebtsByUserId('user-1')).map((item) => item.id),
      [debt.id],
    );
    assertEquals(
      (await db.getUnpaidDebtsByUserId('user-1')).map((item) => item.id),
      [debt.id],
    );
    assertEquals(await db.getDebtSummary('user-1'), {
      totalLent: 100,
      totalBorrowed: 0,
      totalLentPaid: 0,
      totalBorrowedPaid: 0,
      pendingLentCount: 1,
      pendingBorrowedCount: 0,
    });

    await db.settleDebt(debt.id);

    assertEquals(await db.getUnpaidDebtsByUserId('user-1'), []);
    assertEquals(await db.getDebtSummary('user-1'), {
      totalLent: 0,
      totalBorrowed: 0,
      totalLentPaid: 100,
      totalBorrowedPaid: 0,
      pendingLentCount: 0,
      pendingBorrowedCount: 0,
    });
  });
});
