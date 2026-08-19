/**
 * Brain - Work Boost agent facade
 *
 * One pi Agent per session. The agent loop executes database tools and feeds
 * results back to the model; text is streamed to the caller through chunk
 * callbacks with a size/time flush policy.
 */

import { Agent } from '@earendil-works/pi-agent-core';
import type { TSchema as SchemaType } from '@earendil-works/pi-ai';
import type { Database } from '@work-boost/data-provider';
import type { ParsedDebtEntry } from '@work-boost/data-schemas/debt.ts';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { LangfuseService } from '@work-boost/shared/observability/langfuse/langfuse.ts';
import {
  type CompleteStructuredOptions,
  type LlmClient,
  completeStructured,
  createLlmClient,
} from './llm.ts';
import type {
  AgentPort,
  AgentStreamChunk,
  AgentStreamOptions,
  AgentStreamResult,
  DailyWorkReportResult,
} from './ports/agent.ts';
import {
  HUMAN_PROMPT,
  SYSTEM_PROMPT,
  dailyWorkSchema,
  formatDailyWorkReport,
} from './prompts/daily-work/daily-work-prompt.ts';
import {
  DEBT_HUMAN_PROMPT,
  DEBT_SYSTEM_PROMPT,
  debtParseSchema,
  toParsedDebtEntry,
} from './prompts/debt/debt-prompt.ts';
import { type SessionStore, createSessionStore } from './sessions.ts';
import { getDatabaseTools } from './tools/database/database-tools.ts';

export const MIN_CHUNK_SIZE = 10;
export const MAX_CHUNK_DELAY_MS = 100;

export interface BrainDeps {
  apiKey: string;
  db?: Database;
  langfuse?: LangfuseService;
  /** Injectable for tests; defaults to a real pi-ai client. */
  llm?: LlmClient;
  modelId?: string;
}

/**
 * Build the chat system prompt for a session.
 * Includes write-tool confirmation guidance: the model must confirm with the
 * user before mutating data.
 */
function buildChatSystemPrompt(platform?: string, chatId?: string): string {
  return `You are a helpful assistant for Work Boost bot.
Platform: ${platform || 'unknown'}
Chat ID: ${chatId || 'unknown'}

You have access to the user's personal database through tools. You can look up users, tasks, and debts, and create, update, or delete debt records.

Before creating, updating, or deleting a debt, reply with a confirmation that summarizes the action and its details, and only call the write tool after the user confirms.

Provide concise, helpful responses.`;
}

/**
 * Trace an LLM call with Langfuse at the entry point. Fire-and-forget flush
 * so tracing failures never affect the response path.
 */
async function withLangfuseTrace<T>(
  langfuse: LangfuseService | undefined,
  options: {
    name: string;
    model: string;
    input: unknown;
    execute: () => Promise<T>;
    output?: (result: T) => unknown;
  },
): Promise<T> {
  if (!langfuse?.isEnabled()) {
    return options.execute();
  }

  const trace = langfuse.createTrace({ name: `brain_${options.name}`, input: options.input });
  const generation = trace.generation({
    name: options.name,
    model: options.model,
    startTime: Date.now(),
  });

  const flushTrace = (): void => {
    langfuse.flush().catch((error) => {
      logger.warn('Failed to flush Langfuse trace', { error });
    });
  };

  try {
    const result = await options.execute();
    generation.update({ output: options.output ? options.output(result) : result });
    generation.end();
    flushTrace();
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    generation.update({ output: { error: errorMessage } });
    generation.end();
    flushTrace();
    throw error;
  }
}

/**
 * Create the Work Boost agent.
 */
export function createBrain(deps: BrainDeps): AgentPort {
  const { apiKey, db, langfuse } = deps;
  const llm = deps.llm ?? createLlmClient({ modelId: deps.modelId });
  const store: SessionStore = createSessionStore();
  const tools = db ? getDatabaseTools(db) : [];

  const model = llm.models.getModel('google', llm.modelId);
  if (!model) {
    throw new Error(`Model not found: ${llm.modelId}`);
  }

  const createAgentForSession = (): Agent =>
    new Agent({
      initialState: {
        systemPrompt: buildChatSystemPrompt(undefined, undefined),
        model,
        thinkingLevel: 'low',
        tools,
      },
      streamFn: (streamModel, context, options) =>
        llm.models.streamSimple(streamModel, context, options),
      getApiKey: () => apiKey || undefined,
      toolExecution: 'sequential',
    });

  const sendStructuredRequest = <TSchema extends SchemaType>(
    options: Omit<CompleteStructuredOptions<TSchema>, 'models' | 'modelId' | 'apiKey'>,
  ) =>
    completeStructured({
      ...options,
      models: llm.models,
      modelId: llm.modelId,
      apiKey: apiKey || undefined,
    });

  return {
    /**
     * Stream a response, sending chunks as the model generates.
     * Chunks flush at MIN_CHUNK_SIZE characters or MAX_CHUNK_DELAY_MS,
     * followed by a final empty chunk with isFinal: true.
     */
    async stream(
      message: string,
      onChunk: (chunk: AgentStreamChunk) => void | Promise<void>,
      options: AgentStreamOptions = {},
    ): Promise<AgentStreamResult> {
      const { sessionId = 'default', platform, chatId } = options;
      const startTime = Date.now();

      return withLangfuseTrace(langfuse, {
        name: 'chat',
        model: llm.modelId,
        input: { message, sessionId, platform },
        execute: async () => {
          const { agent } = store.getOrCreate(sessionId, createAgentForSession);
          // The system prompt carries per-call platform context
          agent.state.systemPrompt = buildChatSystemPrompt(platform, chatId);

          const pendingChunks: string[] = [];
          let accumulated = '';
          let chunksSent = 0;
          let flushTimer: number | undefined;
          let streamError: string | undefined;

          const flush = async (): Promise<void> => {
            if (pendingChunks.length === 0) return;
            const content = pendingChunks.join('');
            await onChunk({ content, isFinal: false });
            accumulated += content;
            chunksSent += 1;
            pendingChunks.length = 0;
          };

          const clearTimer = (): void => {
            if (flushTimer !== undefined) {
              clearTimeout(flushTimer);
              flushTimer = undefined;
            }
          };

          const scheduleFlush = (): void => {
            if (flushTimer !== undefined || streamError) return;
            flushTimer = setTimeout(() => {
              flushTimer = undefined;
              flush().catch((error) => {
                streamError = error instanceof Error ? error.message : String(error);
              });
            }, MAX_CHUNK_DELAY_MS);
          };

          let unsubscribe: (() => void) | undefined;
          try {
            unsubscribe = agent.subscribe((event) => {
              try {
                if (event.type === 'message_update' && event.role === 'assistant') {
                  const text = event.message.content
                    .filter((block) => block.type === 'text')
                    .map((block) => block.text)
                    .join('');
                  const currentLength = accumulated.length + pendingChunks.join('').length;
                  if (text.length > currentLength) {
                    pendingChunks.push(text.slice(currentLength));
                  }
                  const totalPending = pendingChunks.join('').length;
                  if (totalPending >= MIN_CHUNK_SIZE) {
                    clearTimer();
                    return flush();
                  }
                  scheduleFlush();
                } else if (event.type === 'agent_end') {
                  clearTimer();
                  return flush();
                }
              } catch (error) {
                streamError = error instanceof Error ? error.message : String(error);
                clearTimer();
              }
            });

            await agent.prompt(message);
          } finally {
            // Ensure unsubscribe is called even if subscribe or prompt throws
            if (unsubscribe) {
              try {
                unsubscribe();
              } catch {
                // Ignore unsubscribe errors to prevent masking original errors
              }
            }
            // Always clear the timer to prevent memory leaks
            clearTimer();
          }

          await onChunk({ content: '', isFinal: true });

          const duration = Date.now() - startTime;
          if (streamError) {
            return {
              success: false,
              content: accumulated,
              chunksSent,
              error: streamError,
              duration,
            };
          }

          // LLM failures settle the run with a failure assistant message
          const lastAssistantMessage = [...agent.state.messages]
            .reverse()
            .find((message) => message.role === 'assistant');
          const stopReason = lastAssistantMessage?.stopReason;
          if (stopReason === 'error' || stopReason === 'aborted') {
            return {
              success: false,
              content: accumulated,
              chunksSent,
              error: lastAssistantMessage?.errorMessage ?? `LLM call failed (${stopReason})`,
              duration,
            };
          }

          return { success: true, content: accumulated, chunksSent, duration };
        },
      });
    },

    async parseDebtEntry(input: string): Promise<ParsedDebtEntry | null> {
      try {
        const parsed = await withLangfuseTrace(langfuse, {
          name: 'parse-debt-entry',
          model: llm.modelId,
          input: { input },
          execute: () =>
            sendStructuredRequest({
              systemPrompt: DEBT_SYSTEM_PROMPT,
              messages: [
                {
                  role: 'user',
                  content: DEBT_HUMAN_PROMPT(input),
                  timestamp: Date.now(),
                },
              ],
              schema: debtParseSchema,
              description: 'Debt entry parsing result',
            }),
        });
        return toParsedDebtEntry(parsed);
      } catch (error) {
        logger.warn('Failed to parse debt entry', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },

    async generateDailyWorkReport(content: string): Promise<DailyWorkReportResult> {
      try {
        const report = await withLangfuseTrace(langfuse, {
          name: 'daily-work-report',
          model: llm.modelId,
          input: { content },
          execute: () =>
            sendStructuredRequest({
              systemPrompt: SYSTEM_PROMPT,
              messages: [
                {
                  role: 'user',
                  content: HUMAN_PROMPT.replace('{USER_INPUT}', content),
                  timestamp: Date.now(),
                },
              ],
              schema: dailyWorkSchema,
              description: 'Daily work report structure',
            }),
        });
        return { success: true, content: formatDailyWorkReport(report) };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to generate daily work report', { error: errorMessage });
        return { success: false, error: errorMessage };
      }
    },

    async createSession(sessionId?: string): Promise<string> {
      const id = sessionId || crypto.randomUUID();
      store.getOrCreate(id, createAgentForSession);
      return id;
    },

    async loadSession(sessionId: string): Promise<void> {
      store.getOrCreate(sessionId, createAgentForSession);
    },

    async removeSession(sessionId: string): Promise<boolean> {
      return store.remove(sessionId);
    },

    dispose() {
      store.stopCleanup();
    },
  };
}
