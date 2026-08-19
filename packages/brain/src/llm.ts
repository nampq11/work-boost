/**
 * LLM layer: pi-ai model client construction and structured output completion.
 */

import {
  type AssistantMessage,
  type Message,
  type Models,
  type TSchema as SchemaType,
  type Static,
  type Tool,
  createModels,
  parseJsonWithRepair,
} from '@earendil-works/pi-ai';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { Value } from 'typebox/value';

export const DEFAULT_MODEL_ID = 'gemini-2.5-flash';

/**
 * Name of the tool that carries the structured output schema.
 * The model is instructed to emit its response through this tool so the
 * provider can apply constrained sampling; a plain-text JSON fallback is
 * parsed when the model responds with text instead.
 */
export const RESPONSE_TOOL_NAME = 'respond_json';

export interface LlmClient {
  models: Models;
  modelId: string;
}

/**
 * Create a pi-ai client with the google provider registered.
 */
export function createLlmClient(deps: { modelId?: string } = {}): LlmClient {
  const models = createModels();
  models.setProvider(googleProvider());
  return { models, modelId: deps.modelId ?? DEFAULT_MODEL_ID };
}

export interface CompleteStructuredOptions<TSchema extends SchemaType> {
  models: Models;
  modelId: string;
  /** Overrides the provider's env-based API key resolution when set. */
  apiKey?: string;
  systemPrompt: string;
  messages: Message[];
  schema: TSchema;
  /** Human-readable description of the expected JSON, shown to the model. */
  description: string;
  /** Number of retries after a schema-validating response (default 1). */
  maxRetries?: number;
}

interface ExtractResult<TSchema extends SchemaType> {
  success: true;
  value: Static<TSchema>;
}

interface ExtractFailure {
  success: false;
  error: string;
}

/**
 * Extract structured data from an assistant response: prefer the response
 * tool call, fall back to text JSON.
 */
function extractStructured<TSchema extends SchemaType>(
  response: AssistantMessage,
  schema: TSchema,
): ExtractResult<TSchema> | ExtractFailure {
  const toolCall = response.content.find(
    (block) => block.type === 'toolCall' && block.name === RESPONSE_TOOL_NAME,
  );
  if (toolCall && toolCall.type === 'toolCall') {
    if (Value.Check(schema, toolCall.arguments)) {
      return { success: true, value: toolCall.arguments as Static<TSchema> };
    }
    return {
      success: false,
      error: `response tool arguments failed schema validation: ${firstSchemaError(schema, toolCall.arguments)}`,
    };
  }

  const text = response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  if (!text) {
    return { success: false, error: 'response contained neither a response tool call nor text' };
  }

  try {
    const parsed = parseJsonWithRepair(stripCodeFences(text));
    if (Value.Check(schema, parsed)) {
      return { success: true, value: parsed as Static<TSchema> };
    }
    return {
      success: false,
      error: `text JSON failed schema validation: ${firstSchemaError(schema, parsed)}`,
    };
  } catch {
    return { success: false, error: 'response text did not contain valid JSON' };
  }
}

/**
 * Strip markdown code fences and surrounding prose so parseJsonWithRepair
 * only ever sees the JSON payload itself.
 */
function stripCodeFences(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1] ?? text;
  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);
  return start === -1 ? text : text.slice(start);
}

function firstSchemaError<TSchema extends SchemaType>(schema: TSchema, data: unknown): string {
  for (const error of Value.Errors(schema, data)) {
    // TypeBox error shapes vary by kind; path is absent on some (e.g. additional-properties)
    const path = 'path' in error ? error.path : '';
    return `${path}: ${error.message}`;
  }
  return 'unknown validation error';
}

/**
 * Ask the model for a response matching `schema`, with validation and retry.
 *
 * Gemini 2.5 has no responseSchema support in pi, so the schema is attached
 * to a response tool with constrained sampling ('prefer' = best effort) and
 * the result is validated with TypeBox. On failure a corrective message is
 * appended and the request is retried up to `maxRetries` times. Throws when
 * no valid response is produced.
 */
export async function completeStructured<TSchema extends SchemaType>(
  options: CompleteStructuredOptions<TSchema>,
): Promise<Static<TSchema>> {
  const {
    models,
    modelId,
    apiKey,
    systemPrompt,
    messages,
    schema,
    description,
    maxRetries = 1,
  } = options;

  const model = models.getModel('google', modelId);
  if (!model) {
    throw new Error(`Model not found: ${modelId}`);
  }

  const responseTool: Tool = {
    name: RESPONSE_TOOL_NAME,
    description,
    parameters: schema,
    constrainedSampling: { type: 'json_schema', strict: 'prefer' },
  };

  let contextMessages = messages;
  let lastFailure = 'no response was produced';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await models.complete(
      model,
      { systemPrompt, messages: contextMessages, tools: [responseTool] },
      { apiKey },
    );

    const result = extractStructured(response, schema);
    if (result.success) {
      return result.value;
    }
    lastFailure = result.error;

    // The model's response did not match the schema: tell it what went wrong
    // and let it retry with the correction in context.
    contextMessages = [
      ...contextMessages,
      {
        role: 'user' as const,
        content:
          `Your previous response could not be parsed into the required JSON schema. Error: ${lastFailure}. ` +
          'Respond again with ONLY a JSON object matching the schema. Do not use markdown code fences.',
        timestamp: Date.now(),
      },
    ];
  }

  throw new Error(
    `Failed to produce a valid structured response after ${maxRetries + 1} attempts: ${lastFailure}`,
  );
}
