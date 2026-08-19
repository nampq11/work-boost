import type { AgentToolResult } from '@earendil-works/pi-agent-core';

/**
 * Build a successful tool result carrying both the JSON text the model sees
 * and the structured data for logs.
 */
export function successResult(data: unknown, message?: string): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text: message ?? JSON.stringify(data) }],
    details: { data, message },
  };
}
