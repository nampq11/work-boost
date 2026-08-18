/**
 * Langfuse Types
 *
 * Type definitions for Langfuse observability integration.
 * Following codebase patterns from Brain and Logger services.
 */

/**
 * Langfuse configuration options
 */
export interface LangfuseConfig {
  /** Langfuse public key (pk-lf-...) */
  publicKey?: string;

  /** Langfuse secret key (sk-lf-...) */
  secretKey?: string;

  /** Langfuse API host URL (default: https://cloud.langfuse.com) */
  host?: string;

  /** Whether tracing is enabled (default: false) */
  enabled?: boolean;
}

/**
 * Configuration for the Langfuse service
 */
export interface LangfuseServiceConfig extends LangfuseConfig {
  /** Flush interval in milliseconds (default: 1000) */
  flushInterval?: number;
}

/**
 * Metadata for trace creation
 */
export interface TraceMetadata {
  /** User ID for trace correlation */
  userId?: string;

  /** Session ID for conversation grouping */
  sessionId?: string;

  /** Platform (slack, telegram) */
  platform?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Trace creation options
 */
export interface CreateTraceOptions extends TraceMetadata {
  /** Trace name */
  name: string;

  /** Input data for the trace */
  input?: unknown;

  /** Tags for filtering */
  tags?: string[];
}

/**
 * Span/Generation creation options
 */
export interface CreateSpanOptions {
  /** Span name */
  name: string;

  /** Input data */
  input?: unknown;

  /** Output data */
  output?: unknown;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Tags for filtering */
  tags?: string[];
}

/**
 * Generation options for LLM calls
 */
export interface CreateGenerationOptions extends CreateSpanOptions {
  /** Model name (e.g., gemini-2.5-flash) */
  model?: string;

  /** Model parameters */
  modelParameters?: Record<string, unknown>;

  /** Usage details */
  usageDetails?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };

  /** Cost details */
  costDetails?: {
    totalCost?: number;
    currency?: string;
  };

  /** Start time (ms since epoch) */
  startTime?: number;
}

/**
 * Langfuse tracer interface
 * Defines the contract for the Langfuse service
 */
export interface LangfuseTracer {
  /**
   * Create a new trace
   */
  createTrace(options: CreateTraceOptions): LangfuseTrace;

  /**
   * Flush pending traces to Langfuse
   */
  flush(): Promise<void>;

  /**
   * Shutdown the tracer gracefully
   */
  shutdown(): Promise<void>;

  /**
   * Check if tracing is enabled
   */
  isEnabled(): boolean;
}

/**
 * Langfuse trace interface
 */
export interface LangfuseTrace {
  /**
   * Update trace metadata
   */
  update(options: {
    output?: unknown;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): void;

  /**
   * Create a span within this trace
   */
  span(options: CreateSpanOptions): LangfuseSpan;

  /**
   * Create a generation (LLM call) within this trace
   */
  generation(options: CreateGenerationOptions): LangfuseGeneration;

  /**
   * End the trace
   */
  end(): void;
}

/**
 * Langfuse span interface
 */
export interface LangfuseSpan {
  /**
   * Update span data
   */
  update(options: {
    output?: unknown;
    metadata?: Record<string, unknown>;
  }): void;

  /**
   * End the span
   */
  end(): void;
}

/**
 * Langfuse generation (LLM call) interface
 */
export interface LangfuseGeneration extends LangfuseSpan {
  /**
   * Update generation with LLM response data
   */
  update(options: {
    output?: unknown;
    usageDetails?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    costDetails?: {
      totalCost?: number;
      currency?: string;
    };
    metadata?: Record<string, unknown>;
  }): void;
}
