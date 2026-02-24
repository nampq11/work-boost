import { assertEquals, assertExists } from '@std/assert';
import { Brain } from '../src/core/brain/index.ts';

Deno.test('Brain - initialize and run daily work report', async () => {
  const apiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) {
    console.log('Skipping test: GOOGLE_API_KEY not set');
    return;
  }

  const brain = await Brain.init({
    model: 'gemini-2.5-flash',
    apiKey,
  });

  // Check brain is initialized
  assertExists(brain);

  // Check capabilities are available
  const capabilities = brain.getCapabilities();
  assertEquals(capabilities.length > 0, true);

  // Find the daily work report capability
  const dailyWorkCapability = brain.getCapability('daily-work-report');
  assertExists(dailyWorkCapability);
  assertEquals(dailyWorkCapability?.id, 'daily-work-report');

  // Run the brain with a test message
  const result = await brain.run(
    'hoàn thành:B4: squirrel cai thien mo hinh, chưa hoàn thành N/A, dự định làm: B5: squirrel cai thien mo hinh',
    { verbose: false },
  );

  // Check we got a response
  assertExists(result.response);
  assertEquals(typeof result.response, 'string');
  assertEquals(result.response.length > 0, true);
});
