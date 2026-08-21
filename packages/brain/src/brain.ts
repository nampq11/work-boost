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
import type { ResolvedAIConfig } from '@work-boost/data-schemas/config.ts';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { createSessionStore } from './sessions.ts';
import { SYSTEM_PROMPT } from './system-prompt.ts';
import { getWorkspaceTools } from './tools/index.ts';
import { AIUnavailableError, type AgentPort } from './types.ts';

export interface BrainDeps {
  dataLayer: DataLayer;
  ai?: ResolvedAIConfig;
  credentials?: CredentialStore;
  authContext?: AuthContext;
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

export class Brain implements AgentPort {
  private readonly store: ReturnType<typeof createSessionStore>;
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly models;
  private readonly model: Model<any>;
  private readonly tools;
  readonly ai: ResolvedAIConfig;

  constructor(deps: BrainDeps) {
    this.ai = deps.ai ?? { provider: 'google', model: 'gemini-2.5-flash' };
    const models = createModels({
      credentials: deps.credentials ?? new InMemoryCredentialStore(),
      authContext: deps.authContext ?? createEnvironmentAuthContext(),
    });
    models.setProvider(createProvider(this.ai.provider));
    const model = models.getModel(this.ai.provider, this.ai.model);
    if (!model) {
      throw new Error(`Unknown AI model "${this.ai.model}" for provider "${this.ai.provider}"`);
    }

    this.models = models;
    this.model = model;
    this.store = createSessionStore();
    this.tools = getWorkspaceTools(deps.dataLayer);
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
  async stream(
    message: string,
    options?: { sessionId?: string; signal?: AbortSignal },
  ): Promise<string> {
    const sessionId = options?.sessionId || 'default';

    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(() => this.runTurn(sessionId, message, options?.signal));
    this.queues.set(sessionId, current);

    try {
      return await current;
    } finally {
      if (this.queues.get(sessionId) === current) {
        this.queues.delete(sessionId);
      }
    }
  }

  private async runTurn(sessionId: string, message: string, signal?: AbortSignal): Promise<string> {
    const { agent } = this.store.getOrCreate(sessionId, () => this.createAgent());

    let accumulatedText = '';

    const unsubscribe = agent.subscribe((event) => {
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const text = event.message.content
          .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('');
        accumulatedText += text ? text + '\n\n' : '';
      }
    });

    try {
      if (signal) {
        if (signal.aborted) {
          throw new Error('Operation aborted');
        }
        signal.addEventListener('abort', () => agent.abort(), { once: true });
      }

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
    this.store.stopCleanup();
  }
}
