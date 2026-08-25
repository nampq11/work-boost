import { assertEquals } from '@std/assert';
import { createTimeTool } from '@work-boost/brain';
import type { ConfigManager } from '@work-boost/data-provider';
import { WorkspaceConfigSchema } from '@work-boost/data-schemas/config.ts';

function createFakeConfigManager(config: Record<string, unknown> = {}): ConfigManager {
  const baseConfig = {
    version: 1,
    workspaceName: 'Test',
    timezone: config.timezone || 'Asia/Ho_Chi_Minh',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };
  return {
    load: () => Promise.resolve(WorkspaceConfigSchema.parse(baseConfig)),
    save: () => Promise.resolve(),
  };
}

Deno.test('get_current_time returns date and time', async () => {
  const configMgr = createFakeConfigManager();
  const tool = createTimeTool(configMgr);

  const result = await tool.execute('call_1', {});

  const data = result.details as {
    data: {
      currentDate: string;
      fullTime: string;
      timezone: string;
    };
  };
  assertEquals(data.data.timezone, 'Asia/Ho_Chi_Minh');
  assertEquals(data.data.currentDate.length > 0, true);
  assertEquals(data.data.fullTime.length > 0, true);
});

Deno.test('get_current_time uses configured timezone', async () => {
  const configMgr = createFakeConfigManager({ timezone: 'America/New_York' });
  const tool = createTimeTool(configMgr);

  const result = await tool.execute('call_1', {});
  const data = result.details as { data: { timezone: string } };
  assertEquals(data.data.timezone, 'America/New_York');
});

Deno.test('get_current_time has no parameters', () => {
  const configMgr = createFakeConfigManager();
  const tool = createTimeTool(configMgr);
  assertEquals(tool.name, 'get_current_time');
  assertEquals(tool.parameters.type, 'object');
  assertEquals(Object.keys(tool.parameters.properties || {}).length, 0);
});
