import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import type { AgentPort } from '@work-boost/brain';
import { createDataLayer, type DataLayer } from '@work-boost/data-provider';
import { handleAssistantRequest } from '../../apps/api/src/routes/assistant.ts';
import { AssistantService } from '../../apps/api/src/services/assistant-service.ts';

async function createService(): Promise<{ service: AssistantService; dataLayer: DataLayer }> {
  const root = await Deno.makeTempDir({ prefix: 'work-boost-assistant-test-' });
  const dataLayer = createDataLayer(root);
  await dataLayer.fs.init();
  const agent: AgentPort = {
    stream: async (_message, options) => {
      options?.onText?.('Hello');
      options?.onText?.(' from the agent');
      return 'Hello from the agent';
    },
    removeSession: () => true,
  };
  return { service: new AssistantService(dataLayer, agent), dataLayer };
}

async function request(
  service: AssistantService,
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  return await handleAssistantRequest(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path,
    service,
    crypto.randomUUID(),
  );
}

async function waitForCompletion(service: AssistantService, responseId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await service.getResponse(responseId);
    if (response?.status === 'completed' || response?.status === 'failed') return response;
    if (response?.status === 'completed' || response?.status === 'failed') {
      await service.waitForResponse(responseId);
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Response did not complete');
}

Deno.test('assistant API creates threads, starts responses, and lists durable messages', async () => {
  const { service } = await createService();

  const createdThread = await request(service, '/v1/threads', 'POST', { title: 'Daily work' });
  assertEquals(createdThread.status, 201);
  const thread = (await createdThread.json()).data as { id: string; title: string };
  assertEquals(thread.title, 'Daily work');

  const accepted = await request(service, `/v1/threads/${thread.id}/responses`, 'POST', {
    input: 'Summarize my day',
  });
  assertEquals(accepted.status, 202);
  const response = (await accepted.json()).data as { id: string; status: string };
  assertEquals(['queued', 'running'].includes(response.status), true);

  await service.waitForResponse(response.id);
  const completed = await waitForCompletion(service, response.id);
  assertEquals(completed.outputText, 'Hello from the agent');

  const messages = await request(service, `/v1/threads/${thread.id}/messages`, 'GET');
  assertEquals(messages.status, 200);
  const messageData = (await messages.json()).data as Array<{ role: string; content: string }>;
  assertEquals(
    messageData.map((message) => message.role),
    ['user', 'assistant'],
  );
  assertEquals(messageData[1].content, 'Hello from the agent');
});

Deno.test('assistant response GET supports SSE replay and cancellation', async () => {
  const { service } = await createService();
  const thread = await service.createThread();
  const response = await service.createResponse(thread.id, 'Hello');
  assert(response);
  await service.waitForResponse(response.id);
  await waitForCompletion(service, response.id);

  const streamResponse = await request(service, `/v1/responses/${response.id}`, 'GET');
  assertEquals(streamResponse.status, 200);
  const json = (await streamResponse.json()).data as { status: string };
  assertEquals(json.status, 'completed');

  const sseResponse = await handleAssistantRequest(
    new Request(`http://localhost/v1/responses/${response.id}`, {
      headers: { accept: 'text/event-stream' },
    }),
    `/v1/responses/${response.id}`,
    service,
    crypto.randomUUID(),
  );
  assertEquals(sseResponse.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assertStringIncludes(await sseResponse.text(), 'response.completed');
});
