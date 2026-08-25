import type { ChatModelRunOptions, ThreadMessage } from '@assistant-ui/react';
/// <reference lib="deno.ns" />
import { assertEquals, assertRejects } from '@std/assert';
import {
  createCopilotAdapter,
  getLatestUserText,
} from '../../../src/components/ai/copilot-adapter.ts';
import { ApiError } from '../../../src/lib/api-client.ts';

const userMessage = (text: string): ThreadMessage =>
  ({
    id: crypto.randomUUID(),
    role: 'user',
    createdAt: new Date(),
    content: [{ type: 'text', text }],
    attachments: [],
    metadata: { custom: {} },
  }) as ThreadMessage;

const runOptions = (
  messages: readonly ThreadMessage[],
  abortSignal: AbortSignal,
): ChatModelRunOptions => ({ messages, abortSignal }) as ChatModelRunOptions;

Deno.test('copilot adapter sends only the latest user turn and preserves the session', async () => {
  const calls: { message: string; sessionId: string; signal?: AbortSignal }[] = [];
  const adapter = createCopilotAdapter('page-session', {
    sendMessage: async (message, sessionId, signal) => {
      calls.push({ message, sessionId, signal });
      return { response: '# Result', sessionId };
    },
  });
  const abortController = new AbortController();

  const result = await adapter.run(
    runOptions([userMessage('first'), userMessage('latest')], abortController.signal),
  );

  assertEquals(calls, [
    { message: 'latest', sessionId: 'page-session', signal: abortController.signal },
  ]);
  assertEquals(result, { content: [{ type: 'text', text: '# Result' }] });
});

Deno.test('copilot adapter rethrows API errors instead of creating assistant messages', async () => {
  const error = new ApiError('AI_UNAVAILABLE', 'The AI provider is unavailable');
  const adapter = createCopilotAdapter('page-session', {
    sendMessage: () => Promise.reject(error),
  });

  const received = await assertRejects(async () => {
    await adapter.run(runOptions([userMessage('hello')], new AbortController().signal));
  });
  assertEquals(received, error);
});

Deno.test('latest user text rejects an empty turn', async () => {
  await assertRejects(async () => getLatestUserText([userMessage('  ')]));
});

Deno.test('copilot adapter propagates cancellation errors unchanged', async () => {
  const abortError = new DOMException('Aborted', 'AbortError');
  const adapter = createCopilotAdapter('page-session', {
    sendMessage: () => Promise.reject(abortError),
  });

  const received = await assertRejects(async () => {
    await adapter.run(runOptions([userMessage('hello')], new AbortController().signal));
  });
  assertEquals(received, abortError);
});

Deno.test('copilot adapter exposes tool calls as assistant-ui message parts', async () => {
  const adapter = createCopilotAdapter('page-session', {
    createResponse: async () => ({ id: 'response-1' }),
    streamResponse: async function* () {
      yield {
        type: 'response.tool_call.started',
        response: {
          id: 'response-1',
          status: 'running',
          outputText: '',
          toolCalls: [
            { id: 'tool-1', name: 'get_current_time', args: {}, status: 'running' as const },
          ],
          error: null,
        },
      };
      yield {
        type: 'response.tool_call.completed',
        response: {
          id: 'response-1',
          status: 'running',
          outputText: '',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'get_current_time',
              args: {},
              status: 'completed' as const,
              result: { content: [{ type: 'text', text: '09:30' }] },
            },
          ],
          error: null,
        },
      };
    },
  });

  const updates = [];
  const stream = adapter.run(
    runOptions([userMessage('What time is it?')], new AbortController().signal),
  );
  for await (const update of stream as AsyncGenerator<{ content: readonly unknown[] }>) {
    updates.push(update);
  }

  assertEquals(updates.length, 2);
  assertEquals(updates[0]?.content[0], {
    type: 'tool-call',
    toolCallId: 'tool-1',
    toolName: 'get_current_time',
    args: {},
    argsText: '{}',
  });
  const completedPart = updates[1]?.content[0] as { result?: unknown } | undefined;
  if (!completedPart) throw new Error('The completed tool call update is missing.');
  assertEquals(completedPart.result, {
    content: [{ type: 'text', text: '09:30' }],
  });
});

Deno.test('copilot adapter preserves tool calls before following assistant text', async () => {
  const adapter = createCopilotAdapter('page-session', {
    createResponse: async () => ({ id: 'response-1' }),
    streamResponse: async function* () {
      yield {
        type: 'response.tool_call.completed',
        response: {
          id: 'response-1',
          status: 'running',
          outputText: '',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'get_current_time',
              args: {},
              status: 'completed' as const,
              result: { content: [{ type: 'text', text: '09:30' }] },
            },
          ],
          error: null,
        },
      };
      yield { type: 'response.output_text.delta', delta: 'The time is 09:30.' };
    },
  });

  let finalContent: readonly unknown[] = [];
  const stream = adapter.run(
    runOptions([userMessage('What time is it?')], new AbortController().signal),
  );
  for await (const update of stream as AsyncGenerator<{ content: readonly unknown[] }>) {
    finalContent = update.content;
  }

  assertEquals(
    finalContent.map((part) => (part as { type: string }).type),
    ['tool-call', 'text'],
  );
});
