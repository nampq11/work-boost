/**
 * Brain - Work Boost agent facade.
 *
 * Wraps a pi Agent loop with workspace tools. Each session maintains its own
 * conversation transcript via the session store; the system prompt carries
 * the shared workspace instructions.
 */

import { Agent } from '@earendil-works/pi-agent-core';
import { createModels } from '@earendil-works/pi-ai';
import type { Model } from '@earendil-works/pi-ai';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import type { DataLayer } from '@work-boost/data-provider';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { AgentPort } from './ports/agent.ts';
import { SYSTEM_PROMPT } from './prompts/index.ts';
import { createSessionStore } from './sessions.ts';
import { getWorkspaceTools } from './tools/index.ts';

const DEFAULT_MODEL_ID = 'gemini-2.5-flash';

export interface BrainDeps {
  apiKey: string;
  dataLayer: DataLayer;
}

export function createBrain(deps: BrainDeps): Brain {
  return new Brain(deps);
}

export class Brain implements AgentPort {
  private readonly store = createSessionStore();
  private readonly models;
  private readonly model: Model<any>;
  private readonly tools;
  private readonly getApiKey?: () => string | undefined;

  constructor(deps: BrainDeps) {
    const models = createModels();
    models.setProvider(googleProvider());
    const model = models.getModel('google', DEFAULT_MODEL_ID);
    if (!model) {
      throw new Error(`Model not found: ${DEFAULT_MODEL_ID}`);
    }

    this.models = models;
    this.model = model;
    this.tools = getWorkspaceTools(deps.dataLayer);

    if (deps.apiKey) {
      this.getApiKey = () => deps.apiKey;
    }
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
      getApiKey: this.getApiKey,
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
    const { signal } = options || {};

    const { agent } = this.store.getOrCreate(sessionId, () => this.createAgent());

    let accumulatedText = '';

    const unsubscribe = agent.subscribe((event, abortSignal) => {
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
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        messageLength: message.length,
      });
      throw error;
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
