/**
 * Session store: holds one pi Agent per conversation session.
 *
 * Sessions expire after a TTL of inactivity (default 24h) and are swept by a
 * periodic cleanup pass (default every 1h), preserving the old ContextManager
 * semantics.
 */

import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core';

export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_MAX_MESSAGES = 50;

interface SessionEntry {
  agent: Agent;
  lastUsedAt: number;
}

export interface SessionStoreOptions {
  sessionTTLMs?: number;
  cleanupIntervalMs?: number;
  maxMessages?: number;
}

export interface SessionStore {
  /** Get an existing session's agent or create one via the factory. */
  getOrCreate(sessionId: string, createAgent: () => Agent): { agent: Agent; isNew: boolean };
  get(sessionId: string): Agent | undefined;
  remove(sessionId: string): boolean;
  list(): string[];
  getMessages(sessionId: string): AgentMessage[];
  clear(sessionId: string): boolean;
  size(): number;
  /** Stop the cleanup timer. Intended for tests. */
  stopCleanup(): void;
}

/**
 * Create the session store. The cleanup pass runs on a recursive timeout so
 * it survives long-lived processes without a separate scheduler.
 */
export function createSessionStore(options: SessionStoreOptions = {}): SessionStore {
  const sessionTTLMs = options.sessionTTLMs ?? DEFAULT_SESSION_TTL_MS;
  const cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;

  const sessions = new Map<string, SessionEntry>();

  function touch(sessionId: string): void {
    const entry = sessions.get(sessionId);
    if (entry) entry.lastUsedAt = Date.now();
  }

  function trimTranscript(agent: Agent): void {
    if (agent.state.messages.length <= maxMessages) return;
    agent.state.messages = agent.state.messages.slice(-maxMessages);
  }

  function cleanup(): void {
    const cutoff = Date.now() - sessionTTLMs;
    for (const [sessionId, entry] of sessions) {
      if (entry.lastUsedAt < cutoff) {
        sessions.delete(sessionId);
      }
    }
  }

  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  function startCleanup(): void {
    cleanupTimer = setTimeout(() => {
      cleanup();
      startCleanup();
    }, cleanupIntervalMs);
  }
  startCleanup();

  return {
    getOrCreate(sessionId, createAgent) {
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.lastUsedAt = Date.now();
        trimTranscript(existing.agent);
        return { agent: existing.agent, isNew: false };
      }
      const agent = createAgent();
      sessions.set(sessionId, { agent, lastUsedAt: Date.now() });
      return { agent, isNew: true };
    },
    get(sessionId) {
      const entry = sessions.get(sessionId);
      if (!entry) return undefined;
      touch(sessionId);
      trimTranscript(entry.agent);
      return entry.agent;
    },
    remove(sessionId) {
      return sessions.delete(sessionId);
    },
    list() {
      return [...sessions.keys()];
    },
    getMessages(sessionId) {
      const entry = sessions.get(sessionId);
      if (!entry) return [];
      touch(sessionId);
      // Return a shallow copy to prevent external mutations while allowing read access
      return entry.agent.state.messages.slice();
    },
    clear(sessionId) {
      const entry = sessions.get(sessionId);
      if (!entry) return false;
      entry.agent.reset();
      return true;
    },
    size() {
      return sessions.size;
    },
    stopCleanup() {
      if (cleanupTimer !== undefined) {
        clearTimeout(cleanupTimer);
        cleanupTimer = undefined;
      }
    },
  };
}
