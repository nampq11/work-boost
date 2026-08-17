/**
 * Working Memory
 *
 * Short-term context for the current session.
 * Holds the goal, entities, and partial results as the agent executes.
 */

import type { WorkingMemory as WorkingMemoryType } from './types.ts';

/**
 * Working memory manager
 *
 * Keeps track of:
 * - Current goal/intent
 * - Important entities mentioned
 * - Context from previous steps
 * - Partial results from in-progress operations
 */
export class WorkingMemory {
  private memories: Map<string, WorkingMemoryType>;
  private ttl: number;
  private cleanupTimer: number | null;

  constructor(ttl = 60 * 60 * 1000) {
    // 1 hour default
    this.memories = new Map();
    this.ttl = ttl;
    this.cleanupTimer = null;
    this.startCleanup();
  }

  /**
   * Get or create working memory for a session
   */
  get(sessionId: string): WorkingMemoryType {
    let memory = this.memories.get(sessionId);

    if (!memory) {
      memory = {
        sessionId,
        entities: new Map(),
        context: [],
        partialResults: new Map(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memories.set(sessionId, memory);
    }

    memory.updatedAt = new Date();
    return memory;
  }

  /**
   * Set the current goal
   */
  setGoal(sessionId: string, goal: string): void {
    const memory = this.get(sessionId);
    memory.goal = goal;
  }

  /**
   * Get the current goal
   */
  getGoal(sessionId: string): string | undefined {
    const memory = this.memories.get(sessionId);
    return memory?.goal;
  }

  /**
   * Store an entity
   */
  setEntity(sessionId: string, key: string, value: unknown): void {
    const memory = this.get(sessionId);
    memory.entities.set(key, value);
  }

  /**
   * Get an entity
   */
  getEntity(sessionId: string, key: string): unknown | undefined {
    const memory = this.memories.get(sessionId);
    return memory?.entities.get(key);
  }

  /**
   * Add context
   */
  addContext(sessionId: string, context: string): void {
    const memory = this.get(sessionId);
    memory.context.push(context);

    // Keep only recent context (last 20 entries)
    if (memory.context.length > 20) {
      memory.context = memory.context.slice(-20);
    }
  }

  /**
   * Get all context
   */
  getContext(sessionId: string): string[] {
    const memory = this.memories.get(sessionId);
    return memory?.context ?? [];
  }

  /**
   * Store a partial result
   */
  setPartialResult(sessionId: string, key: string, value: unknown): void {
    const memory = this.get(sessionId);
    memory.partialResults.set(key, value);
  }

  /**
   * Get a partial result
   */
  getPartialResult(sessionId: string, key: string): unknown | undefined {
    const memory = this.memories.get(sessionId);
    return memory?.partialResults.get(key);
  }

  /**
   * Clear partial results
   */
  clearPartialResults(sessionId: string): void {
    const memory = this.get(sessionId);
    memory?.partialResults.clear();
  }

  /**
   * Clear working memory for a session
   */
  clear(sessionId: string): void {
    this.memories.delete(sessionId);
  }

  /**
   * Check if a session has working memory
   */
  has(sessionId: string): boolean {
    return this.memories.has(sessionId);
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    const scheduleCleanup = () => {
      this.cleanupTimer = setTimeout(
        () => {
          this.cleanup();
          scheduleCleanup();
        },
        5 * 60 * 1000,
      ); // Every 5 minutes
    };

    scheduleCleanup();
  }

  /**
   * Clean up expired working memory
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, memory] of this.memories) {
      const age = now - memory.updatedAt.getTime();
      if (age > this.ttl) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      this.memories.delete(sessionId);
    }

    if (expired.length > 0) {
      // Use logger if available, otherwise silent cleanup
      console.debug(`Cleaned up ${expired.length} expired working memory entries`);
    }
  }

  /**
   * Stop cleanup timer (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get memory summary for debugging
   */
  getSummary(sessionId: string): string | undefined {
    const memory = this.memories.get(sessionId);
    if (!memory) return undefined;

    return `WorkingMemory[${sessionId}]:
  goal: ${memory.goal || 'none'}
  entities: ${memory.entities.size}
  context: ${memory.context.length} entries
  partialResults: ${memory.partialResults.size}
  age: ${Date.now() - memory.updatedAt.getTime()}ms`;
  }
}
