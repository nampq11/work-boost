/**
 * Brain Context
 *
 * The conversation history - the thread connecting actions
 * into coherent behavior. Context is precious. Isolate noisy
 * subtasks. Truncate verbose outputs. Protect clarity.
 */

import { logger } from '../logger/logger.ts';
import type { Context, Message } from './types.ts';

const DEFAULT_SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Context manager for conversation history
 *
 * Automatically cleans up expired sessions to prevent memory leaks.
 */
export class ContextManager {
  private contexts: Map<string, Context>;
  private sessionTTL: number;
  private cleanupTimer: number | null;

  constructor(sessionTTL: number = DEFAULT_SESSION_TTL) {
    this.contexts = new Map();
    this.sessionTTL = sessionTTL;
    this.cleanupTimer = null;
    this.startCleanupTask();
  }

  /**
   * Start the background cleanup task
   */
  private startCleanupTask(): void {
    // Using setInterval for periodic cleanup
    // In Deno, we use setTimeout recursively to avoid blocking
    const scheduleCleanup = () => {
      this.cleanupTimer = setTimeout(() => {
        this.cleanupExpiredSessions();
        scheduleCleanup();
      }, CLEANUP_INTERVAL);
    };

    scheduleCleanup();
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, context] of this.contexts) {
      const lastUsed = context.lastUsedAt.getTime();
      if (now - lastUsed > this.sessionTTL) {
        expired.push(sessionId);
      }
    }

    if (expired.length > 0) {
      for (const sessionId of expired) {
        this.contexts.delete(sessionId);
      }
      logger.debug(`Cleaned up ${expired.length} expired session(s)`, {
        expiredSessions: expired,
        remainingSessions: this.contexts.size,
      });
    }
  }

  /**
   * Stop the cleanup task (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get or create a context for a session
   */
  getOrCreateContext(sessionId: string): Context {
    let context = this.contexts.get(sessionId);

    if (!context) {
      context = {
        sessionId,
        messages: [],
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };
      this.contexts.set(sessionId, context);
    }

    context.lastUsedAt = new Date();
    return context;
  }

  /**
   * Add a message to the context
   */
  addMessage(sessionId: string, message: Message): void {
    const context = this.getOrCreateContext(sessionId);

    if (!message.timestamp) {
      message.timestamp = new Date();
    }

    context.messages.push(message);

    // Trim context if it gets too large (protect clarity)
    this.trimContextIfNeeded(context);
  }

  /**
   * Get all messages for a session
   */
  getMessages(sessionId: string): Message[] {
    const context = this.contexts.get(sessionId);
    return context?.messages || [];
  }

  /**
   * Clear messages for a session
   */
  clearContext(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.messages = [];
      context.lastUsedAt = new Date();
    }
  }

  /**
   * Remove a context
   */
  removeContext(sessionId: string): boolean {
    return this.contexts.delete(sessionId);
  }

  /**
   * List all session IDs
   */
  listSessions(): string[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Get the number of active sessions
   */
  getSessionCount(): number {
    return this.contexts.size;
  }

  /**
   * Trim context if it exceeds reasonable size
   * Context is precious - keep only what's needed
   */
  private trimContextIfNeeded(context: Context, maxMessages: number = 50): void {
    if (context.messages.length > maxMessages) {
      // Keep the most recent messages
      context.messages = context.messages.slice(-maxMessages);
    }
  }

  /**
   * Get context summary for debugging
   */
  getContextSummary(sessionId: string): string {
    const context = this.contexts.get(sessionId);
    if (!context) {
      return `Session ${sessionId} not found`;
    }

    return `Session ${sessionId}: ${context.messages.length} messages, created ${context.createdAt.toISOString()}, last used ${context.lastUsedAt.toISOString()}`;
  }
}
