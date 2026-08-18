/**
 * Streaming Response Types
 *
 * Types for streaming LLM responses to the user.
 * Sends partial responses as they arrive from the LLM.
 */

/**
 * A chunk of streamed response
 */
export interface StreamChunk {
  /** Chunk content */
  content: string;

  /** Whether this is the final chunk */
  isFinal: boolean;

  /** Chunk index */
  index: number;

  /** Timestamp when this chunk was received */
  timestamp: Date;
}

/**
 * Stream event callback
 */
export type StreamCallback = (chunk: StreamChunk) => void | Promise<void>;

/**
 * Stream options
 */
export interface StreamOptions {
  /** Callback for each chunk */
  onChunk: StreamCallback;

  /** Whether to accumulate chunks for final result */
  accumulate?: boolean;

  /** Minimum chunk size before sending (characters) */
  minChunkSize?: number;

  /** Maximum time to wait before sending pending chunk (ms) */
  maxChunkDelay?: number;

  /** Whether to send partial tool calls */
  includeToolCalls?: boolean;
}

/**
 * Stream state
 */
export interface StreamState {
  /** Accumulated content */
  accumulated: string;

  /** Pending content not yet sent */
  pending: string;

  /** Number of chunks sent */
  chunksSent: number;

  /** Last chunk sent timestamp */
  lastSentAt: Date | null;

  /** Whether stream is complete */
  complete: boolean;

  /** Any error that occurred */
  error?: string;
}

/**
 * Stream result
 */
export interface StreamResult {
  /** Complete accumulated content */
  content: string;

  /** Number of chunks sent */
  chunksSent: number;

  /** Whether stream completed successfully */
  success: boolean;

  /** Error if stream failed */
  error?: string;

  /** Duration of stream (ms) */
  duration: number;
}
