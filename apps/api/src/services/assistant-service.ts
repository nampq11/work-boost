import type { AgentPort, AgentToolEvent } from '@work-boost/brain';
import type { DataLayer } from '@work-boost/data-provider';
import { logger } from '@work-boost/shared/logger/logger.ts';

const THREADS_DIR = '.workboost/assistant/threads';
const MAX_EVENTS = 500;

export type ResponseStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MessageRole = 'user' | 'assistant';

export interface AssistantThread {
  id: string;
  object: 'thread';
  title: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessage {
  id: string;
  object: 'thread.message';
  threadId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}
export interface AssistantToolCall {
  id: string;
  name: string;
  args: unknown;
  status: 'running' | 'completed';
  result?: unknown;
  isError?: boolean;
}

export interface AssistantResponse {
  id: string;
  object: 'response';
  threadId: string;
  status: ResponseStatus;
  inputMessageId: string;
  outputMessageId: string | null;
  outputText: string;
  toolCalls: AssistantToolCall[];
  error: { code: string; message: string } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ResponseEvent {
  type:
    | 'response.created'
    | 'response.started'
    | 'response.output_text.delta'
    | 'response.tool_call.started'
    | 'response.tool_call.completed'
    | 'response.completed'
    | 'response.failed'
    | 'response.cancelled';
  response: AssistantResponse;
  delta?: string;
}

interface StoredThread {
  thread: AssistantThread;
  messages: AssistantMessage[];
  responses: AssistantResponse[];
}

type ResponseListener = (event: ResponseEvent) => void;

function now(): string {
  return new Date().toISOString();
}

function threadPath(threadId: string): string {
  return `${THREADS_DIR}/${threadId}.json`;
}

function terminal(status: ResponseStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export class AssistantService {
  private readonly threads = new Map<string, StoredThread>();
  private readonly responses = new Map<string, AssistantResponse>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly tasks = new Map<string, Promise<void>>();
  private readonly listeners = new Map<string, Set<ResponseListener>>();
  private readonly events = new Map<string, ResponseEvent[]>();
  private readonly eventSnapshots = new Map<string, AssistantResponse>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly deleting = new Set<string>();
  private readonly ready: Promise<void>;

  constructor(
    private readonly dataLayer: DataLayer,
    private readonly agent: AgentPort,
  ) {
    this.ready = this.load();
  }

  async waitUntilReady(): Promise<void> {
    await this.ready;
  }

  private async load(): Promise<void> {
    await this.dataLayer.fs.mkdir('.workboost/assistant');
    await this.dataLayer.fs.mkdir(THREADS_DIR);
    const files = await this.dataLayer.fs.listFiles(THREADS_DIR);

    for (const file of files.filter((entry) => entry.endsWith('.json'))) {
      try {
        const stored = JSON.parse(await this.dataLayer.fs.readText(file)) as StoredThread;
        if (
          !stored.thread?.id ||
          !Array.isArray(stored.messages) ||
          !Array.isArray(stored.responses)
        ) {
          throw new Error('invalid assistant thread shape');
        }
        for (const response of stored.responses) {
          response.toolCalls ??= [];
          if (response.status === 'queued' || response.status === 'running') {
            response.status = 'failed';
            response.error = {
              code: 'PROCESS_RESTARTED',
              message: 'The response was interrupted by a server restart.',
            };
            response.completedAt = now();
          }
          this.responses.set(response.id, response);
        }
        this.threads.set(stored.thread.id, stored);
        if (stored.responses.some((response) => response.status === 'failed')) {
          await this.save(stored);
        }
      } catch (error) {
        logger.error('[AssistantService.load]', {
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async withLock<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(threadId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(threadId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(threadId) === current) this.locks.delete(threadId);
    }
  }

  private async save(stored: StoredThread): Promise<void> {
    await this.dataLayer.fs.writeTextAtomic(threadPath(stored.thread.id), JSON.stringify(stored));
  }

  private async withStoredThread<T>(
    threadId: string,
    operation: (stored: StoredThread) => Promise<T>,
  ): Promise<T | undefined> {
    return this.withLock(threadId, async () => {
      if (this.deleting.has(threadId)) return undefined;
      const stored = this.getStored(threadId);
      if (!stored) return undefined;
      return operation(stored);
    });
  }

  private emit(event: ResponseEvent): void {
    const responseListeners = this.listeners.get(event.response.id);
    for (const listener of responseListeners ?? []) listener(event);
  }

  private recordEvent(responseId: string, event: ResponseEvent): void {
    if (!this.responses.has(responseId)) return;
    const recordedEvent: ResponseEvent = {
      ...event,
      response: {
        ...event.response,
        error: event.response.error ? { ...event.response.error } : null,
        toolCalls: event.response.toolCalls.map((toolCall) => ({ ...toolCall })),
      },
    };
    const events = this.events.get(responseId) ?? [];
    events.push(recordedEvent);
    if (events.length > MAX_EVENTS) {
      const trimCount = events.length - (MAX_EVENTS - 1);
      const removed = events.splice(0, trimCount);
      const snapshot = removed.at(-1);
      if (snapshot) this.eventSnapshots.set(responseId, { ...snapshot.response });
    }
    this.events.set(responseId, events);
    this.emit(recordedEvent);
  }

  private recordToolEvent(response: AssistantResponse, event: AgentToolEvent): void {
    const existing = response.toolCalls.find((toolCall) => toolCall.id === event.toolCallId);
    if (event.type === 'started') {
      if (!existing) {
        response.toolCalls.push({
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
          status: 'running',
        });
      }
      this.recordEvent(response.id, { type: 'response.tool_call.started', response });
      return;
    }

    if (existing) {
      existing.status = 'completed';
      existing.result = event.result;
      existing.isError = event.isError;
    } else {
      response.toolCalls.push({
        id: event.toolCallId,
        name: event.toolName,
        args: event.args,
        status: 'completed',
        result: event.result,
        isError: event.isError,
      });
    }
    this.recordEvent(response.id, { type: 'response.tool_call.completed', response });
  }

  private getStored(threadId: string): StoredThread | undefined {
    return this.threads.get(threadId);
  }

  async createThread(input?: {
    title?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AssistantThread> {
    await this.ready;
    const timestamp = now();
    const thread: AssistantThread = {
      id: crypto.randomUUID(),
      object: 'thread',
      title: input?.title?.trim() || null,
      metadata: input?.metadata ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const stored: StoredThread = { thread, messages: [], responses: [] };
    this.threads.set(thread.id, stored);
    await this.save(stored);
    return thread;
  }

  async listThreads(limit: number): Promise<{ items: AssistantThread[]; hasMore: boolean }> {
    await this.ready;
    const items = [...this.threads.values()]
      .sort((left, right) => right.thread.updatedAt.localeCompare(left.thread.updatedAt))
      .map((stored) => stored.thread);
    return { items: items.slice(0, limit), hasMore: items.length > limit };
  }

  async getThread(threadId: string): Promise<AssistantThread | undefined> {
    await this.ready;
    return this.getStored(threadId)?.thread;
  }

  async updateThread(
    threadId: string,
    input: { title?: string | null; metadata?: Record<string, unknown> },
  ): Promise<AssistantThread | undefined> {
    await this.ready;
    return this.withLock(threadId, async () => {
      if (this.deleting.has(threadId)) return undefined;
      const stored = this.getStored(threadId);
      if (!stored) return undefined;
      if (input.title !== undefined) stored.thread.title = input.title?.trim() || null;
      if (input.metadata !== undefined) stored.thread.metadata = input.metadata;
      stored.thread.updatedAt = now();
      await this.save(stored);
      return stored.thread;
    });
  }

  async deleteThread(threadId: string): Promise<boolean> {
    await this.ready;
    const pendingTasks = await this.withLock(threadId, async () => {
      const stored = this.getStored(threadId);
      if (!stored) return undefined;
      this.deleting.add(threadId);
      const tasks: Promise<void>[] = [];
      for (const response of stored.responses) {
        this.controllers.get(response.id)?.abort();
        this.controllers.delete(response.id);
        const task = this.tasks.get(response.id);
        if (task) tasks.push(task);
      }
      return tasks;
    });
    if (!pendingTasks) return false;
    await Promise.allSettled(pendingTasks);
    return this.withLock(threadId, async () => {
      const stored = this.getStored(threadId);
      if (!stored) {
        this.deleting.delete(threadId);
        return false;
      }
      for (const response of stored.responses) {
        this.responses.delete(response.id);
        this.events.delete(response.id);
        this.eventSnapshots.delete(response.id);
        this.tasks.delete(response.id);
        this.listeners.delete(response.id);
      }
      this.agent.removeSession(threadId);
      this.threads.delete(threadId);
      try {
        await this.dataLayer.fs.remove(threadPath(threadId));
        return true;
      } finally {
        this.deleting.delete(threadId);
      }
    });
  }

  async getMessages(threadId: string): Promise<AssistantMessage[] | undefined> {
    await this.ready;
    return this.getStored(threadId)?.messages;
  }

  async waitForResponse(responseId: string): Promise<void> {
    await this.tasks.get(responseId);
  }

  async getResponse(responseId: string): Promise<AssistantResponse | undefined> {
    await this.ready;
    return this.responses.get(responseId);
  }

  getResponseEvents(responseId: string): ResponseEvent[] {
    const response = this.responses.get(responseId);
    if (!response) return [];
    const snapshot = this.eventSnapshots.get(responseId);
    const events = this.events.get(responseId) ?? [];
    return snapshot
      ? [{ type: 'response.started', response: { ...snapshot } }, ...events]
      : [...events];
  }

  subscribeResponse(responseId: string, listener: ResponseListener): () => void {
    const responseListeners = this.listeners.get(responseId) ?? new Set<ResponseListener>();
    responseListeners.add(listener);
    this.listeners.set(responseId, responseListeners);
    return () => {
      responseListeners.delete(listener);
      if (responseListeners.size === 0) this.listeners.delete(responseId);
    };
  }

  async createResponse(threadId: string, input: string): Promise<AssistantResponse | undefined> {
    await this.ready;
    return this.withLock(threadId, async () => {
      if (this.deleting.has(threadId)) return undefined;
      const stored = this.getStored(threadId);
      if (!stored) return undefined;
      const timestamp = now();
      const inputMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        object: 'thread.message',
        threadId,
        role: 'user',
        content: input,
        createdAt: timestamp,
      };
      const response: AssistantResponse = {
        id: crypto.randomUUID(),
        object: 'response',
        threadId,
        status: 'queued',
        inputMessageId: inputMessage.id,
        outputMessageId: null,
        outputText: '',
        toolCalls: [],
        error: null,
        createdAt: timestamp,
        completedAt: null,
      };
      stored.messages.push(inputMessage);
      stored.responses.push(response);
      stored.thread.updatedAt = timestamp;
      this.responses.set(response.id, response);
      await this.save(stored);
      this.recordEvent(response.id, { type: 'response.created', response });
      const controller = new AbortController();
      this.controllers.set(response.id, controller);
      const task = this.executeResponse(response, controller);
      this.tasks.set(response.id, task);
      void task.then(
        () => this.tasks.delete(response.id),
        () => this.tasks.delete(response.id),
      );
      return response;
    });
  }

  private async executeResponse(
    response: AssistantResponse,
    controller: AbortController,
  ): Promise<void> {
    response.status = 'running';
    this.recordEvent(response.id, { type: 'response.started', response });
    await this.withStoredThread(response.threadId, (stored) => this.save(stored));
    if (this.deleting.has(response.threadId)) return;

    try {
      const inputMessage = this.getStored(response.threadId)?.messages.find(
        (message) => message.id === response.inputMessageId,
      );
      if (!inputMessage) throw new Error('The response input message is missing.');
      const output = await this.agent.stream(inputMessage.content, {
        sessionId: response.threadId,
        signal: controller.signal,
        onText: (delta) => {
          if (response.status !== 'running' || this.deleting.has(response.threadId)) return;
          response.outputText += delta;
          this.recordEvent(response.id, {
            type: 'response.output_text.delta',
            response,
            delta,
          });
        },
        onTool: (toolEvent) => {
          if (response.status !== 'running' || this.deleting.has(response.threadId)) return;
          this.recordToolEvent(response, toolEvent);
        },
      });
      if (response.status !== 'running') return;
      const persisted = await this.withStoredThread(response.threadId, async (stored) => {
        if (response.status !== 'running') return false;
        response.outputText = output;
        const outputMessage: AssistantMessage = {
          id: crypto.randomUUID(),
          object: 'thread.message',
          threadId: response.threadId,
          role: 'assistant',
          content: output,
          createdAt: now(),
        };
        stored.messages.push(outputMessage);
        response.outputMessageId = outputMessage.id;
        response.status = 'completed';
        response.completedAt = now();
        stored.thread.updatedAt = response.completedAt;
        await this.save(stored);
        return true;
      });
      if (persisted) this.recordEvent(response.id, { type: 'response.completed', response });
    } catch (error) {
      if ((response.status as ResponseStatus) === 'cancelled') return;
      const persisted = await this.withStoredThread(response.threadId, async (stored) => {
        response.status = controller.signal.aborted ? 'cancelled' : 'failed';
        response.error = controller.signal.aborted
          ? { code: 'CANCELLED', message: 'The response was cancelled.' }
          : {
              code: 'AI_UNAVAILABLE',
              message: error instanceof Error ? error.message : 'The AI provider is unavailable.',
            };
        response.completedAt = now();
        await this.save(stored);
        return true;
      });
      if (persisted) {
        const finalStatus = response.status as ResponseStatus;
        this.recordEvent(response.id, {
          type: finalStatus === 'cancelled' ? 'response.cancelled' : 'response.failed',
          response,
        });
      }
    } finally {
      this.controllers.delete(response.id);
    }
  }

  async cancelResponse(responseId: string): Promise<AssistantResponse | undefined> {
    await this.ready;
    const response = this.responses.get(responseId);
    if (!response) return undefined;
    if (terminal(response.status)) return response;
    const persisted = await this.withStoredThread(response.threadId, async (stored) => {
      if (terminal(response.status)) return false;
      response.status = 'cancelled';
      response.error = { code: 'CANCELLED', message: 'The response was cancelled.' };
      response.completedAt = now();
      this.controllers.get(responseId)?.abort();
      await this.save(stored);
      return true;
    });
    if (!persisted) return undefined;
    this.recordEvent(responseId, { type: 'response.cancelled', response });
    return response;
  }
}
