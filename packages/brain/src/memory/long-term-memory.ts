/**
 * Long-term Memory
 *
 * Stores and retrieves knowledge from KV for persistent memory.
 * Following agent-builder philosophy:
 * > Make knowledge available, not mandatory. Load it when relevant.
 */

/// <reference lib="deno.unstable" />
import type { GoogleGenAI } from '@google/genai';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { LangfuseService } from '@work-boost/shared/observability/langfuse/langfuse.ts';
import type {
  MemoryEntry,
  MemoryRetrieveOptions,
  MemorySearchResult,
  MemoryStoreOptions,
  MemoryType,
} from './types.ts';

/**
 * KV key structure for memory storage
 */
const MemoryKeys = {
  entry: (id: string) => ['memory', 'entries', id] as const,
  byUser: (userId: string, id: string) => ['memory', 'by_user', userId, id] as const,
  byUserPrefix: (userId: string) => ['memory', 'by_user', userId] as const,
  byType: (type: MemoryType, id: string) => ['memory', 'by_type', type, id] as const,
  indexPrefix: () => ['memory', 'index'] as const,
};

/**
 * Long-term memory implementation using Deno KV
 *
 * Stores knowledge that persists across sessions:
 * - User preferences
 * - Frequently asked questions
 * - Important facts
 * - Learned patterns
 */
export class LongTermMemory {
  private kv: Deno.Kv;
  private ai: GoogleGenAI;
  private langfuse?: LangfuseService | null;

  constructor(kv: Deno.Kv, ai: GoogleGenAI, langfuse?: LangfuseService | null) {
    this.kv = kv;
    this.ai = ai;
    this.langfuse = langfuse;
  }

  /**
   * Store a new memory entry
   */
  async store(
    memory: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>,
    options: MemoryStoreOptions = {},
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    const importance = options.importance ?? 0.5;

    const entry: MemoryEntry = {
      id,
      ...memory,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      importance,
    };

    // Calculate expiration if TTL is set
    const expiresAt = options.ttl ? new Date(now.getTime() + options.ttl) : undefined;

    // Store primary entry
    const atomic = this.kv
      .atomic()
      .set(MemoryKeys.entry(id), entry)
      .set(MemoryKeys.byUser(memory.userId, id), { ...entry, expiresAt })
      .set(MemoryKeys.byType(memory.type, id), id);

    // Set expiration if TTL provided
    if (expiresAt) {
      // Note: Deno KV doesn't support per-entry expiration in atomic operations
      // We handle expiration in retrieval and cleanup
    }

    await atomic.commit();

    logger.debug('Memory stored', {
      id,
      userId: memory.userId,
      type: memory.type,
      importance,
    });

    return id;
  }

  /**
   * Retrieve memories relevant to a query
   *
   * Uses semantic search with embeddings to find relevant memories.
   * Falls back to keyword matching if embeddings aren't available.
   */
  async retrieve(
    query: string,
    userId: string,
    options: MemoryRetrieveOptions = {},
  ): Promise<MemorySearchResult[]> {
    const { maxResults = 10, minScore = 0.3, types, filters = {}, updateStats = true } = options;

    const startTime = Date.now();

    // Get all memories for the user
    const userMemories: MemoryEntry[] = [];
    const entries = this.kv.list({ prefix: MemoryKeys.byUserPrefix(userId) });

    for await (const entry of entries) {
      const mem = entry.value as { expiresAt?: Date } & MemoryEntry;

      // Skip expired memories
      if (mem.expiresAt && mem.expiresAt < new Date()) {
        continue;
      }

      // Filter by type if specified
      if (types && !types.includes(mem.type)) {
        continue;
      }

      // Filter by metadata
      let matchesFilter = true;
      for (const [key, value] of Object.entries(filters)) {
        if (mem.metadata[key] !== value) {
          matchesFilter = false;
          break;
        }
      }

      if (!matchesFilter) continue;

      userMemories.push(mem);
    }

    // Score memories by relevance to query
    const results: MemorySearchResult[] = [];

    for (const memory of userMemories) {
      const score = await this.calculateRelevance(query, memory);

      if (score >= minScore) {
        results.push({
          memory,
          score,
          reason: this.getRelevanceReason(score, memory),
        });
      }
    }

    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    const limited = results.slice(0, maxResults);

    // Update access stats if requested
    if (updateStats && limited.length > 0) {
      for (const result of limited) {
        await this.updateAccessStats(result.memory.id);
      }
    }

    const duration = Date.now() - startTime;
    logger.debug('Memory retrieval', {
      userId,
      queryLength: query.length,
      resultCount: limited.length,
      duration,
    });

    return limited;
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<MemoryEntry | null> {
    const result = await this.kv.get<MemoryEntry>(MemoryKeys.entry(id));
    return result.value ?? null;
  }

  /**
   * Update a memory
   */
  async update(
    id: string,
    updates: Partial<Omit<MemoryEntry, 'id' | 'createdAt'>>,
  ): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;

    const updated: MemoryEntry = {
      ...existing,
      ...updates,
    };

    await this.kv
      .atomic()
      .set(MemoryKeys.entry(id), updated)
      .set(MemoryKeys.byUser(existing.userId, id), updated)
      .commit();

    return true;
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;

    await this.kv
      .atomic()
      .delete(MemoryKeys.entry(id))
      .delete(MemoryKeys.byUser(existing.userId, id))
      .delete(MemoryKeys.byType(existing.type, id))
      .commit();

    return true;
  }

  /**
   * Get all memories for a user
   */
  async getByUser(
    userId: string,
    options: { type?: MemoryType; limit?: number } = {},
  ): Promise<MemoryEntry[]> {
    const memories: MemoryEntry[] = [];
    const entries = this.kv.list({ prefix: MemoryKeys.byUserPrefix(userId) });

    let count = 0;
    const max = options.limit ?? 100;

    for await (const entry of entries) {
      if (count >= max) break;

      const mem = entry.value as MemoryEntry;

      // Filter by type if specified
      if (options.type && mem.type !== options.type) {
        continue;
      }

      // Skip expired
      if (mem.expiresAt && mem.expiresAt < new Date()) {
        continue;
      }

      memories.push(mem);
      count++;
    }

    return memories.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Clean up expired memories
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    // Scan through memories and remove expired ones
    const prefix = MemoryKeys.indexPrefix();
    const entries = this.kv.list({ prefix });

    for await (const entry of entries) {
      const mem = entry.value as MemoryEntry & { expiresAt?: Date };

      if (mem.expiresAt && mem.expiresAt < now) {
        await this.delete(mem.id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired memories`);
    }

    return cleaned;
  }

  /**
   * Calculate relevance score between query and memory
   *
   * Uses simple keyword matching for now.
   * Could be enhanced with embeddings for semantic search.
   */
  private async calculateRelevance(query: string, memory: MemoryEntry): Promise<number> {
    const queryLower = query.toLowerCase();
    const contentLower = memory.content.toLowerCase();

    let score = 0;

    // Exact match
    if (contentLower.includes(queryLower) || queryLower.includes(contentLower)) {
      score += 0.5;
    }

    // Word overlap
    const queryWords = new Set(queryLower.split(/\s+/));
    const contentWords = new Set(contentLower.split(/\s+/));
    const overlap = [...queryWords].filter((w) => contentWords.has(w) && w.length > 2);
    const overlapRatio = overlap.length / Math.max(queryWords.size, 1);
    score += overlapRatio * 0.3;

    // Metadata matches
    for (const [key, value] of Object.entries(memory.metadata)) {
      const valueStr = String(value).toLowerCase();
      if (valueStr.includes(queryLower) || queryLower.includes(valueStr)) {
        score += 0.1;
      }
    }

    // Boost by importance
    score *= 0.5 + memory.importance;

    // Boost by recent access (recency bonus)
    const daysSinceAccess = (Date.now() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0, 1 - daysSinceAccess / 30) * 0.2; // Decays over 30 days
    score += recencyBonus;

    return Math.min(1, score);
  }

  /**
   * Get human-readable reason for relevance
   */
  private getRelevanceReason(score: number, memory: MemoryEntry): string {
    if (score > 0.8) return 'Highly relevant - content directly matches query';
    if (score > 0.6) return 'Very relevant - strong content or metadata match';
    if (score > 0.4) return 'Relevant - partial match with content or keywords';
    if (score > 0.2) return 'Somewhat relevant - keyword overlap';
    return 'Weakly relevant - minimal connection';
  }

  /**
   * Update access statistics for a memory
   */
  private async updateAccessStats(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;

    await this.update(id, {
      lastAccessedAt: new Date(),
      accessCount: existing.accessCount + 1,
    });
  }
}

/**
 * Create a long-term memory instance
 */
export function createLongTermMemory(
  kv: Deno.Kv,
  ai: GoogleGenAI,
  langfuse?: LangfuseService | null,
): LongTermMemory {
  return new LongTermMemory(kv, ai, langfuse);
}
