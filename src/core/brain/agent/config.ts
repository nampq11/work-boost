import z, { string } from 'zod';

export const AgentCardSchema = z
  .object({
    name: z.string().default('work-boost'),
    description: z
      .string()
      .default(
        'work-boost is an AI assistant capable of generating daily work reports in a consistent format.',
      ),
    provider: z.object({
      organization: z.string().default('nampham1106'),
      url: z.string().url().default('https://github.com/nampq1106'),
    }),
    version: z.string().default('1.0.0'),
    defaultInputModes: z.array(z.string()).default(['application/json', 'text/plain']),
    defaultOutputModes: z
      .array(z.string())
      .default(['application/json', 'text/event-stream', 'text/plain']),
    skills: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          tags: z.array(z.string()),
          examples: z.array(z.string()).optional(),
          inputModes: z.array(z.string()).optional().default(['text/plain']),
          outputModes: z.array(z.string()).optional().default(['text/plain']),
        }),
      )
      .default([
        {
          id: 'chat_with_agent',
          name: 'chat_with_agent',
          description: 'Allows you to chat with an AI agent. Send a message to interact.',
          tags: ['chat', 'AI', 'assistant', 'mcp', 'natural-language'],
          examples: [
            `Send a JSON-RPC request to /mcp with method: 'chat_with_agent' and params: { message: 'Hello, how are you?' }`,
            `Alternatively, use a compatible MCP client library.`,
          ],
          inputModes: ['text/plain'],
          outputModes: ['text/plain'],
        },
      ]),
  })
  .strict();

export const AgentConfigSchema = z.object({
  agentCard: AgentCardSchema.describe('Configuration for the agent card').optional(),
});

// Input type for use-facing API (pre-parsing) - makes fields with defaults optional
export type AgentConfig = z.input<typeof AgentConfigSchema>;
