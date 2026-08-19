import { Type } from '@earendil-works/pi-ai';
import type { AssistantMessage, Models } from '@earendil-works/pi-ai';
import { assertEquals, assertRejects } from '@std/assert';
import { RESPONSE_TOOL_NAME, completeStructured } from '@work-boost/brain';

const TEST_SCHEMA = Type.Object({
  direction: Type.String(),
  amount: Type.Number(),
});

interface CapturedCall {
  systemPrompt: string;
  messages: unknown[];
  tools: unknown[];
}

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

function toolCallResponse(args: Record<string, unknown>): AssistantMessage {
  return assistantMessage({
    content: [{ type: 'toolCall', id: 'call_1', name: RESPONSE_TOOL_NAME, arguments: args }],
    stopReason: 'toolUse',
  });
}

function textResponse(text: string): AssistantMessage {
  return assistantMessage({ content: [{ type: 'text', text }] });
}

interface FakeModels extends Models {
  calls: CapturedCall[];
}

function createFakeModels(responses: AssistantMessage[]): FakeModels {
  const calls: CapturedCall[] = [];
  const fake = {
    calls,
    getModel(provider: string, modelId: string) {
      if (provider !== 'google' || modelId !== 'gemini-2.5-flash') return undefined;
      return { provider: 'google', id: modelId };
    },
    complete: async (
      _model: unknown,
      context: { systemPrompt: string; messages: unknown[]; tools: unknown[] },
      _options: unknown,
    ): Promise<AssistantMessage> => {
      calls.push(context);
      const index = Math.min(calls.length - 1, responses.length - 1);
      return responses[index];
    },
  };
  return fake as unknown as FakeModels;
}

function baseOptions(models: FakeModels) {
  return {
    models: models as unknown as Models,
    modelId: 'gemini-2.5-flash',
    systemPrompt: 'Test system prompt',
    messages: [{ role: 'user' as const, content: 'Parse this', timestamp: 1234 }],
    schema: TEST_SCHEMA,
    description: 'Test result',
  };
}

Deno.test('completeStructured returns the response tool arguments when valid', async () => {
  const models = createFakeModels([toolCallResponse({ direction: 'lent', amount: 100 })]);
  const result = await completeStructured(baseOptions(models));
  assertEquals(result, { direction: 'lent', amount: 100 });
});

Deno.test('completeStructured parses JSON from fenced text as a fallback', async () => {
  const models = createFakeModels([
    textResponse('Here is the result:\n```json\n{"direction":"borrowed","amount":50}\n```'),
  ]);
  const result = await completeStructured(baseOptions(models));
  assertEquals(result, { direction: 'borrowed', amount: 50 });
});

Deno.test('completeStructured parses bare JSON text without code fences', async () => {
  const models = createFakeModels([textResponse('{"direction":"lent","amount":25}')]);
  const result = await completeStructured(baseOptions(models));
  assertEquals(result, { direction: 'lent', amount: 25 });
});

Deno.test('completeStructured retries with a corrective message after an invalid response', async () => {
  const models = createFakeModels([
    textResponse('not json at all'),
    toolCallResponse({ direction: 'lent', amount: 100 }),
  ]);
  const result = await completeStructured(baseOptions(models));
  assertEquals(result, { direction: 'lent', amount: 100 });
  assertEquals(models.calls.length, 2);
  const correctiveMessages = models.calls[1].messages;
  assertEquals(correctiveMessages.length, 2);
  const correctiveContent = correctiveMessages[1] as { content: string };
  assertEquals(
    correctiveContent.content.includes('could not be parsed into the required JSON schema'),
    true,
  );
});

Deno.test('completeStructured throws when all attempts are invalid', async () => {
  const models = createFakeModels([textResponse('not json'), textResponse('still not json')]);
  await assertRejects(
    () => completeStructured(baseOptions(models)),
    Error,
    /Failed to produce a valid structured response after 2 attempts/,
  );
});

Deno.test('completeStructured throws when the model is not found', async () => {
  const models = createFakeModels([]);
  const options = { ...baseOptions(models), modelId: 'nonexistent-model' };
  await assertRejects(() => completeStructured(options), Error, /Model not found/);
});
