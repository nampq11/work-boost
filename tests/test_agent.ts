/**
 * Tests for the Work Boost agent facade (createBrain).
 *
 * The real pi Agent runs against a fake LLM (fake event streams and structured
 * responses), so the streaming and failure contracts are exercised without
 * network access.
 */

import type { AssistantMessage, AssistantMessageEvent, Models } from '@earendil-works/pi-ai';
import { assertEquals } from '@std/assert';
import { RESPONSE_TOOL_NAME, createBrain } from '@work-boost/brain';
import type { AgentStreamChunk, LlmClient } from '@work-boost/brain';
import { DebtDirection } from '@work-boost/data-schemas';

function assistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'google',
    provider: 'google',
    model: 'gemini-2.5-flash',
    usage: { input: 0, output: 0, cacheRead: 0 },
    stopReason: 'stop',
    ...overrides,
  } as AssistantMessage;
}

interface FakeStream {
  [Symbol.asyncIterator](): AsyncIterableIterator<AssistantMessageEvent>;
  result(): Promise<AssistantMessage>;
}

function createFakeStream(events: AssistantMessageEvent[], result: AssistantMessage): FakeStream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    async result() {
      return result;
    },
  };
}

/**
 * Build the event sequence for a streaming text response. Each entry is a
 * strictly longer prefix of the final text, mirroring how the provider emits
 * text deltas with growing partials.
 */
function textStreamEvents(prefixes: string[]): AssistantMessageEvent[] {
  const events: AssistantMessageEvent[] = [
    { type: 'start', partial: assistantMessage({ content: [] }) },
  ];
  prefixes.forEach((text, index) => {
    const previous = index === 0 ? '' : prefixes[index - 1];
    const partial = assistantMessage({ content: [{ type: 'text', text }] });
    events.push({
      type: 'text_delta',
      contentIndex: 0,
      delta: text.slice(previous.length),
      partial,
    });
  });
  return events;
}

interface FakeLlm extends LlmClient {
  streamCalls: number;
}

function createFakeLlm(options: {
  streamEvents: AssistantMessageEvent[];
  streamResult: AssistantMessage;
  structuredResponses: AssistantMessage[];
}): FakeLlm {
  const { streamEvents, streamResult, structuredResponses } = options;
  let completedCalls = 0;
  const fake = {
    modelId: 'gemini-2.5-flash',
    streamCalls: 0,
    models: {
      getModel: () => ({ provider: 'google', id: 'gemini-2.5-flash' }),
      streamSimple: () => {
        fake.streamCalls += 1;
        return createFakeStream(streamEvents, streamResult);
      },
      complete: async (): Promise<AssistantMessage> => {
        if (structuredResponses.length === 0) {
          return assistantMessage({ stopReason: 'error', errorMessage: 'no responses queued' });
        }
        const index = Math.min(completedCalls, structuredResponses.length - 1);
        completedCalls += 1;
        return structuredResponses[index];
      },
    } as unknown as Models,
  };
  return fake as unknown as FakeLlm;
}

Deno.test('stream delivers text chunks and a final empty chunk', async () => {
  const text = 'Hello, world! This is a test.';
  const llm = createFakeLlm({
    streamEvents: textStreamEvents([
      'Hello, ',
      'Hello, world! This is',
      'Hello, world! This is a test.',
    ]),
    streamResult: assistantMessage({ content: [{ type: 'text', text }], stopReason: 'stop' }),
    structuredResponses: [],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  const chunks: AgentStreamChunk[] = [];
  const result = await brain.stream(
    'ping',
    (chunk) => {
      chunks.push(chunk);
    },
    { sessionId: 's1' },
  );

  assertEquals(result.success, true);
  assertEquals(result.content, text);
  assertEquals(chunks.at(-1), { content: '', isFinal: true });
  assertEquals(
    chunks
      .filter((chunk) => !chunk.isFinal)
      .map((chunk) => chunk.content)
      .join(''),
    text,
  );
  assertEquals(llm.streamCalls, 1);
  brain.dispose();
});

Deno.test('stream accumulates multiple chunks for long responses', async () => {
  const text = 'A'.repeat(24);
  const llm = createFakeLlm({
    streamEvents: textStreamEvents(['A'.repeat(12), 'A'.repeat(24)]),
    streamResult: assistantMessage({ content: [{ type: 'text', text }], stopReason: 'stop' }),
    structuredResponses: [],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  const chunks: AgentStreamChunk[] = [];
  const result = await brain.stream(
    'ping',
    (chunk) => {
      chunks.push(chunk);
    },
    { sessionId: 's2' },
  );

  assertEquals(result.success, true);
  assertEquals(result.content, text);
  const payloadChunks = chunks.filter((chunk) => !chunk.isFinal);
  assertEquals(payloadChunks.length, 2);
  assertEquals(payloadChunks[0].content, 'A'.repeat(12));
  assertEquals(payloadChunks[1].content, 'A'.repeat(12));
  brain.dispose();
});

Deno.test('stream reports an LLM failure', async () => {
  const failure = assistantMessage({ stopReason: 'error', errorMessage: 'boom', content: [] });
  const llm = createFakeLlm({
    streamEvents: [
      { type: 'start', partial: assistantMessage({ content: [] }) },
      { type: 'error', reason: 'error', error: failure },
    ],
    streamResult: failure,
    structuredResponses: [],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  const result = await brain.stream('ping', () => {}, { sessionId: 's3' });

  assertEquals(result.success, false);
  assertEquals(result.error, 'boom');
  brain.dispose();
});

Deno.test('parseDebtEntry returns a parsed debt entry', async () => {
  const llm = createFakeLlm({
    streamEvents: [],
    streamResult: assistantMessage({}),
    structuredResponses: [
      assistantMessage({
        content: [
          {
            type: 'toolCall',
            id: 'call_1',
            name: RESPONSE_TOOL_NAME,
            arguments: {
              direction: 'lent',
              amount: 100,
              person: 'Alice',
              reason: 'lunch',
              currency: 'VND',
            },
          },
        ],
        stopReason: 'toolUse',
      }),
    ],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  const result = await brain.parseDebtEntry('cho Alice vay 100 VND');

  assertEquals(result?.direction, DebtDirection.LENT);
  assertEquals(result?.amount, 100);
  assertEquals(result?.person, 'Alice');
  assertEquals(result?.reason, 'lunch');
  assertEquals(result?.currency, 'VND');
  brain.dispose();
});

Deno.test('parseDebtEntry returns null when parsing fails', async () => {
  const llm = createFakeLlm({
    streamEvents: [],
    streamResult: assistantMessage({}),
    structuredResponses: [
      assistantMessage({ content: [{ type: 'text', text: 'sorry, no json' }] }),
    ],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  const result = await brain.parseDebtEntry('unparseable');

  assertEquals(result, null);
  brain.dispose();
});

Deno.test('generateDailyWorkReport formats the report in Vietnamese', async () => {
  const llm = createFakeLlm({
    streamEvents: [],
    streamResult: assistantMessage({}),
    structuredResponses: [
      assistantMessage({
        content: [
          {
            type: 'toolCall',
            id: 'call_1',
            name: RESPONSE_TOOL_NAME,
            arguments: {
              completed: [{ project: 'B4', task: 'cai thien mo hinh' }],
              incomplete: [{ project: 'B5', task: 'squirrel' }],
              planned: [{ project: 'B6', task: 'rabbit' }],
            },
          },
        ],
        stopReason: 'toolUse',
      }),
    ],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  const result = await brain.generateDailyWorkReport('hoàn thành B4');

  assertEquals(result.success, true);
  const content = result.content ?? '';
  assertEquals(content.includes('1. Việc hoàn thành hôm trước?'), true);
  assertEquals(content.includes('2. Việc dự định làm hôm trước nhưng không hoàn thành?'), true);
  assertEquals(content.includes('3. Việc dự định làm hôm nay?'), true);
  assertEquals(content.includes('B4: cai thien mo hinh'), true);
  assertEquals(content.includes('B5: squirrel'), true);
  assertEquals(content.includes('B6: rabbit'), true);
  assertEquals(content.includes('N/A'), false);
  brain.dispose();
});

Deno.test('generateDailyWorkReport renders N/A for empty sections', async () => {
  const llm = createFakeLlm({
    streamEvents: [],
    streamResult: assistantMessage({}),
    structuredResponses: [
      assistantMessage({
        content: [
          {
            type: 'toolCall',
            id: 'call_1',
            name: RESPONSE_TOOL_NAME,
            arguments: { completed: [], incomplete: [], planned: [] },
          },
        ],
        stopReason: 'toolUse',
      }),
    ],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  const result = await brain.generateDailyWorkReport('nothing done');

  assertEquals(result.success, true);
  assertEquals((result.content ?? '').includes('N/A'), true);
  brain.dispose();
});

Deno.test('generateDailyWorkReport returns an error when the response is invalid', async () => {
  const llm = createFakeLlm({
    streamEvents: [],
    streamResult: assistantMessage({}),
    structuredResponses: [assistantMessage({ content: [{ type: 'text', text: 'not a report' }] })],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  const result = await brain.generateDailyWorkReport('whatever');

  assertEquals(result.success, false);
  assertEquals(typeof result.error, 'string');
  brain.dispose();
});

Deno.test('createSession, loadSession, and removeSession round trip', async () => {
  const llm = createFakeLlm({
    streamEvents: [],
    streamResult: assistantMessage({}),
    structuredResponses: [],
  });
  const brain = createBrain({ apiKey: 'test-key', llm });

  assertEquals(await brain.createSession('fixed-id'), 'fixed-id');
  await brain.loadSession('fixed-id');
  assertEquals(await brain.removeSession('fixed-id'), true);
  assertEquals(await brain.removeSession('fixed-id'), false);
  brain.dispose();
});
