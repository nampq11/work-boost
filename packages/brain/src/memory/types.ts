/**
 * Memory Layer Types
 *
 * Memory stores and retrieves relevant context from KV for long-term memory.
 * Following agent-builder philosophy:
 * > Make knowledge available, not mandatory. Load it when relevant, not upfront.
 */

/**
 * A memory entry - stored knowledge
 */
export interface MemoryEntry {
  /** Unique ID for this memory */
  id: string;

  /** User ID this memory belongs to */
  userId: string;

  /** Type of memory */
  type: MemoryType;

  /** The memory content */
  content: string;

  /** Key-value metadata for retrieval */
  metadata: Record<string, unknown>;

  /** When this memory was created */
  createdAt: Date;

  /** When this memory was last accessed */
  lastAccessedAt: Date;

  /** Access count for relevance ranking */
  accessCount: number;

  /** Optional expiration time */
  expiresAt?: Date;

  /** Memory importance (0-1, higher = more important) */
  importance: number;
}

/**
 * Types of memory
 */
export enum MemoryType {
  /** User preferences and settings */
  PREFERENCE = 'preference',

  /** Frequently asked questions */
  FAQ = 'faq',

  /** Past interactions/conversations */
  CONVERSATION = 'conversation',

  /** Facts about the user */
  FACT = 'fact',

  /** Task/project context */
  CONTEXT = 'context',

  /** Learned patterns */
  PATTERN = 'pattern',
}

/**
 * Memory search result with relevance score
 */
export interface MemorySearchResult {
  /** The memory entry */
  memory: MemoryEntry;

  /** Relevance score (0-1, higher = more relevant) */
  score: number;

  /** Why this memory was retrieved */
  reason: string;
}

/**
 * Memory retrieval options
 */
export interface MemoryRetrieveOptions {
  /** Maximum number of memories to retrieve */
  maxResults?: number;

  /** Minimum relevance score (0-1) */
  minScore?: number;

  /** Types to include (undefined = all types) */
  types?: MemoryType[];

  /** Metadata filters */
  filters?: Record<string, unknown>;

  /** Whether to update access stats */
  updateStats?: boolean;
}

/**
 * Memory store options
 */
export interface MemoryStoreOptions {
  /** How long until this memory expires (ms) */
  ttl?: number;

  /** Importance score (0-1) */
  importance?: number;

  /** Whether to deduplicate similar memories */
  deduplicate?: boolean;
}

/**
 * Working memory - short-term context for current session
 */
export interface WorkingMemory {
  /** Session ID */
  sessionId: string;

  /** Current goal/intent */
  goal?: string;

  /** Important entities mentioned */
  entities: Map<string, unknown>;

  /** Context from previous steps */
  context: string[];

  /** Partial results from in-progress operations */
  partialResults: Map<string, unknown>;

  /** When this working memory was created */
  createdAt: Date;

  /** When it was last updated */
  updatedAt: Date;
}

/**
 * Long-term memory interface
 */
export interface LongTermMemory {
  /** Store a memory entry */
  store(
    memory: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>,
  ): Promise<string>;

  /** Retrieve memories relevant to a query */
  retrieve(
    query: string,
    userId: string,
    options?: MemoryRetrieveOptions,
  ): Promise<MemorySearchResult[]>;

  /** Get a memory by ID */
  get(id: string): Promise<MemoryEntry | null>;

  /** Update a memory */
  update(id: string, updates: Partial<Omit<MemoryEntry, 'id' | 'createdAt'>>): Promise<boolean>;

  /** Delete a memory */
  delete(id: string): Promise<boolean>;

  /** Get all memories for a user */
  getByUser(
    userId: string,
    options?: { type?: MemoryType; limit?: number },
  ): Promise<MemoryEntry[]>;

  /** Clear expired memories */
  cleanup(): Promise<number>;
}
