import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core';
import { assertEquals } from '@std/assert';
import { createSessionStore } from '@work-boost/brain';

function createFakeAgent(messages: AgentMessage[] = []): Agent {
  return {
    state: { messages: [...messages], systemPrompt: '' },
    reset() {
      this.state.messages = [];
    },
  } as unknown as Agent;
}

function userMessage(content: string, timestamp: number): AgentMessage {
  return { role: 'user', content, timestamp } as AgentMessage;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

Deno.test('session store creates a new agent on first access and reuses it', () => {
  const store = createSessionStore();
  store.stopCleanup();
  const first = store.getOrCreate('s1', () => createFakeAgent());
  const second = store.getOrCreate('s1', () => createFakeAgent());
  assertEquals(first.isNew, true);
  assertEquals(second.isNew, false);
  assertEquals(second.agent, first.agent);
  assertEquals(store.size(), 1);
  assertEquals(store.list(), ['s1']);
});

Deno.test('session store remove returns whether the session existed', () => {
  const store = createSessionStore();
  store.stopCleanup();
  store.getOrCreate('s1', () => createFakeAgent());
  assertEquals(store.remove('s1'), true);
  assertEquals(store.remove('s1'), false);
});

Deno.test('session store trims the transcript to maxMessages', () => {
  const store = createSessionStore({ maxMessages: 3 });
  store.stopCleanup();
  const { agent } = store.getOrCreate('s1', () => createFakeAgent());
  agent.state.messages = Array.from({ length: 5 }, (_, index) => userMessage(`m${index}`, index));
  // Trim happens on access, not on mutation
  store.get('s1');
  const messages = store.getMessages('s1');
  assertEquals(messages.length, 3);
  assertEquals((messages[2] as { content: string }).content, 'm4');
});

Deno.test('session store clear resets the agent transcript but keeps the session', () => {
  const store = createSessionStore();
  store.stopCleanup();
  store.getOrCreate('s1', () => createFakeAgent([userMessage('old', 1)]));
  assertEquals(store.clear('s1'), true);
  assertEquals(store.getMessages('s1').length, 0);
  // The session entry survives a clear; only the transcript is reset
  assertEquals(store.clear('s1'), true);
  assertEquals(store.size(), 1);
});

Deno.test('session store expires sessions after the TTL of inactivity', async () => {
  const store = createSessionStore({ sessionTTLMs: 30, cleanupIntervalMs: 15 });
  store.getOrCreate('s1', () => createFakeAgent());
  assertEquals(store.size(), 1);
  await sleep(100);
  assertEquals(store.size(), 0);
  store.stopCleanup();
});

Deno.test('session store stopCleanup halts expiry sweeps', async () => {
  const store = createSessionStore({ sessionTTLMs: 10, cleanupIntervalMs: 5 });
  store.getOrCreate('s1', () => createFakeAgent());
  store.stopCleanup();
  await sleep(50);
  assertEquals(store.size(), 1);
});
