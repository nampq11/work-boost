/**
 * Brain - Work Boost agent facade.
 *
 * Wraps a pi Agent loop with workspace tools. Each session maintains its own
 * conversation transcript via the session store; the system prompt carries
 * the shared workspace instructions.
 */

import { Agent } from '@earendil-works/pi-agent-core';
import { InMemoryCredentialStore, createModels } from '@earendil-works/pi-ai';
import type { AuthContext, CredentialStore, Model } from '@earendil-works/pi-ai';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { zaiProvider } from '@earendil-works/pi-ai/providers/zai';
import type { DataLayer } from '@work-boost/data-provider';
import type { AIConfigSetRequest, AuthStatus } from '@work-boost/data-schemas/auth.ts';
import {
  AIProviderSchema,
  AI_DEFAULT_MODELS,
  type ResolvedAIConfig,
} from '@work-boost/data-schemas/config.ts';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { AuthService, AuthServiceError } from './auth-service.ts';
import { createSessionStore } from './sessions.ts';
import { SYSTEM_PROMPT } from './system-prompt.ts';
import { getWorkspaceTools } from './tools/index.ts';
import { AIUnavailableError, type AgentPort, type AgentStreamOptions } from './types.ts';

export interface BrainDeps {
  dataLayer: DataLayer;
  ai?: ResolvedAIConfig;
  credentials?: CredentialStore;
  authContext?: AuthContext;
  authApiPrefix?: string;
}

export function createBrain(deps: BrainDeps): Brain {
  return new Brain(deps);
}

function createProvider(provider: ResolvedAIConfig['provider']) {
  switch (provider) {
    case 'zai':
      return zaiProvider();
    case 'openai-codex':
      return openaiCodexProvider();
    case 'openrouter':
      return openrouterProvider();
    case 'google':
      return googleProvider();
  }
}

/** All AI providers the app can switch between. */
function createAllProviders(): Array<ReturnType<typeof createProvider>> {
  return [
    createProvider('openai-codex'),
    createProvider('openrouter'),
    createProvider('google'),
    createProvider('zai'),
  ];
}

/**
 * Runtime AI configuration boundary consumed by the API server to switch the
 * active provider/model on the fly and persist the choice.
 */
export interface AIConfigPort {
  setAIConfig(input: AIConfigSetRequest): Promise<AuthStatus>;
}
function createEnvironmentAuthContext(): AuthContext {
  return {
    async env(name: string): Promise<string | undefined> {
      const value = Deno.env.get(name);
      if (value?.trim()) return value;
      if (name === 'GEMINI_API_KEY') return Deno.env.get('GOOGLE_API_KEY')?.trim() || undefined;
      return undefined;
    },
    async fileExists(path: string): Promise<boolean> {
      const resolvedPath = path.startsWith('~')
        ? path.replace(/^~/, Deno.env.get('HOME') ?? '')
        : path;
      try {
        await Deno.stat(resolvedPath);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export class Brain implements AgentPort, AIConfigPort {
  private readonly store: ReturnType<typeof createSessionStore>;
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly models;
  private model: Model<any>;
  private readonly tools;
  private readonly dataLayer: DataLayer;
  ai: ResolvedAIConfig;
  readonly auth: AuthService;

  constructor(deps: BrainDeps) {
    this.ai = deps.ai ?? { provider: 'openai-codex', model: 'gpt-5.4-mini' };
    // Register every provider up front so the auth panel can enumerate them and
    // so switching provider at runtime only swaps the active model, not the set.
    const models = createModels({
      credentials: deps.credentials ?? new InMemoryCredentialStore(),
      authContext: deps.authContext ?? createEnvironmentAuthContext(),
    });
    for (const provider of createAllProviders()) models.setProvider(provider);
    const model = models.getModel(this.ai.provider, this.ai.model);
    if (!model) {
      throw new Error(`Unknown AI model "${this.ai.model}" for provider "${this.ai.provider}"`);
    }

    this.models = models;
    this.model = model;
    this.dataLayer = deps.dataLayer;
    this.store = createSessionStore();
    this.tools = getWorkspaceTools(deps.dataLayer);
    this.auth = new AuthService({ ai: this.ai, models, apiPrefix: deps.authApiPrefix });
  }

  /**
   * Switch the active AI provider/model at runtime, persist the choice to
   * `workspaceConfig.ai`, and clear existing sessions so the next prompt uses
   * the newly configured model. Returns the refreshed auth status.
   */
  async setAIConfig(input: AIConfigSetRequest): Promise<AuthStatus> {
    // The model is the explicitly requested one or the provider's default. It
    // must not inherit the previous provider's model (e.g. google's
    // "gemini-2.5-flash") when switching to a provider whose default is
    // undefined (openrouter).
    const provider = AIProviderSchema.safeParse(input.provider);
    if (!provider.success) {
      throw new AuthServiceError(
        'AI_CONFIG_INVALID_PROVIDER',
        `Invalid AI provider "${input.provider}". Supported providers: ${AIProviderSchema.options.join(', ')}`,
        400,
      );
    }
    const model = input.model?.trim() || AI_DEFAULT_MODELS[provider.data];
    if (!model) {
      throw new AuthServiceError(
        'AI_CONFIG_MODEL_REQUIRED',
        `AI model is required when provider "${provider.data}" is selected`,
        400,
      );
    }
    const resolved: ResolvedAIConfig = { provider: provider.data, model };

    const nextModel = this.models.getModel(resolved.provider, resolved.model);
    if (!nextModel) {
      throw new AuthServiceError(
        'AI_CONFIG_UNKNOWN_MODEL',
        `Unknown AI model "${resolved.model}" for provider "${resolved.provider}"`,
        400,
      );
    }

    // Config IO runs after validation so storage faults stay distinguishable
    // from user-correctable input errors.
    const currentConfig = await this.dataLayer.config.load();
    this.ai = resolved;
    this.model = nextModel;
    this.auth.setAIConfig(resolved);
    await this.dataLayer.config.save({ ...currentConfig, ai: resolved });

    // Sessions hold an Agent bound to the previous model, so drop them.
    for (const sessionId of this.store.list()) this.store.remove(sessionId);

    return this.auth.getStatus();
  }

  /**
   * Create a new pi Agent with the system prompt, model, and workspace tools.
   */
  private createAgent(): Agent {
    const streamFn = (model: Model<any>, context: any, options?: any) =>
      this.models.streamSimple(model, context, options);

    return new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: this.model,
        tools: this.tools,
      },
      streamFn,
      toolExecution: 'sequential',
    });
  }

  /**
   * Process a user message through the agent loop and return the complete
   * assistant response text. Tool calls execute directly against markdown
   * files, so the model never sees raw file content unless it asks to.
   */
  async stream(message: string, options?: AgentStreamOptions): Promise<string> {
    const sessionId = options?.sessionId || 'default-session-id';

    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(() => this.runTurn(sessionId, message, options));
    this.queues.set(sessionId, current);

    try {
      return await current;
    } finally {
      if (this.queues.get(sessionId) === current) {
        this.queues.delete(sessionId);
      }
    }
  }

  private async runTurn(
    sessionId: string,
    message: string,
    options?: AgentStreamOptions,
  ): Promise<string> {
    const signal = options?.signal;
    const onText = options?.onText;
    const onTool = options?.onTool;
    const toolArguments = new Map<string, unknown>();
    const { agent } = this.store.getOrCreate(sessionId, () => this.createAgent());

    let accumulatedText = '';

    const unsubscribe = agent.subscribe((event) => {
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta' &&
        onText
      ) {
        onText(event.assistantMessageEvent.delta);
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const text = event.message.content
          .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('');
        accumulatedText += text ? text + '\n\n' : '';
      }
      if (event.type === 'tool_execution_start') {
        toolArguments.set(event.toolCallId, event.args);
        onTool?.({
          type: 'started',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        });
      }
      if (event.type === 'tool_execution_end') {
        onTool?.({
          type: 'completed',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: toolArguments.get(event.toolCallId) ?? {},
          result: event.result,
          isError: event.isError,
        });
        toolArguments.delete(event.toolCallId);
      }
    });

    try {
      if (signal?.aborted) throw new Error('Operation aborted');
      signal?.addEventListener('abort', () => agent.abort(), { once: true });

      await agent.prompt(message);

      if (agent.state.errorMessage) {
        throw new Error(agent.state.errorMessage);
      }
    } catch (error) {
      logger.error('[Brain.stream]', {
        error: error instanceof Error ? error.name : 'UnknownError',
        provider: this.ai.provider,
        model: this.ai.model,
        sessionId,
        messageLength: message.length,
      });
      if (signal?.aborted) throw error;
      throw new AIUnavailableError(this.ai.provider, this.ai.model, { cause: error });
    } finally {
      unsubscribe();
    }

    return accumulatedText.trim();
  }

  /**
   * Remove a session, clearing its conversation history.
   */
  removeSession(sessionId: string): boolean {
    return this.store.remove(sessionId);
  }

  /**
   * Stop background timers. Intended for tests and graceful shutdown.
   */
  dispose(): void {
    this.auth.dispose();
    this.store.stopCleanup();
  }
}
