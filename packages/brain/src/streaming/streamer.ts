/**
 * Streaming Response Handler
 *
 * Sends partial responses as they arrive from the LLM.
 * Provides better user experience for long-running responses.
 */

import type { GoogleGenAI } from '@google/genai';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { LangfuseService } from '@work-boost/shared/observability/langfuse/langfuse.ts';
import type { Message, Tool } from '../types.ts';
import type {
  StreamCallback,
  StreamChunk,
  StreamOptions,
  StreamResult,
  StreamState,
} from './types.ts';

/**
 * Stream response handler
 *
 * Processes streaming LLM responses and sends chunks to callbacks.
 */
export class Streamer {
  private ai: GoogleGenAI;
  private langfuse?: LangfuseService | null;
  private activeStreams: Map<string, StreamState>;

  constructor(ai: GoogleGenAI, langfuse?: LangfuseService | null) {
    this.ai = ai;
    this.langfuse = langfuse;
    this.activeStreams = new Map();
  }

  /**
   * Generate a streaming response
   *
   * Streams chunks as they arrive from the LLM.
   */
  async stream(messages: Message[], tools: Tool[], options: StreamOptions): Promise<StreamResult> {
    const {
      onChunk,
      accumulate = true,
      includeToolCalls = true,
      minChunkSize = 10,
      maxChunkDelay = 100,
    } = options;

    const streamId = crypto.randomUUID();
    const startTime = Date.now();

    // Initialize stream state
    const state: StreamState = {
      accumulated: '',
      pending: '',
      chunksSent: 0,
      lastSentAt: null,
      complete: false,
    };

    this.activeStreams.set(streamId, state);

    // Create trace for streaming
    const trace = this.langfuse?.isEnabled()
      ? this.langfuse.createTrace({
          name: 'streaming_response',
          input: { messageCount: messages.length, toolCount: tools.length },
          metadata: { streamId },
        })
      : null;

    try {
      // Build system prompt with tools
      const toolDescriptions = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

      // Build contents for Gemini (streaming)
      const contents = messages.map((msg) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      // Generate with streaming
      const response = await this.ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents,
        // @ts-ignore - Gemini tool calling API
        tools:
          tools.length > 0
            ? [
                {
                  functionDeclarations: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                  })),
                },
              ]
            : undefined,
      });

      let lastFlush = Date.now();

      // Process streaming response
      for await (const chunk of response) {
        if (chunk.text) {
          state.pending += chunk.text;

          // Check if we should flush the pending chunk
          const shouldFlush =
            state.pending.length >= minChunkSize ||
            (state.lastSentAt && Date.now() - lastFlush >= maxChunkDelay);

          if (shouldFlush) {
            await this.flushChunk(streamId, onChunk, state, accumulate);
            lastFlush = Date.now();
          }
        }

        // Handle function calls in streaming
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          // Flush any pending text first
          await this.flushChunk(streamId, onChunk, state, accumulate);

          if (includeToolCalls) {
            // Send function call info
            for (const call of chunk.functionCalls) {
              const chunkData: StreamChunk = {
                content: JSON.stringify({ type: 'function_call', data: call }),
                isFinal: false,
                index: state.chunksSent++,
                timestamp: new Date(),
              };
              await onChunk(chunkData);
            }
          }
        }
      }

      // Flush any remaining content
      await this.flushChunk(streamId, onChunk, state, accumulate);

      // Send final chunk
      const finalChunk: StreamChunk = {
        content: '',
        isFinal: true,
        index: state.chunksSent++,
        timestamp: new Date(),
      };
      await onChunk(finalChunk);

      state.complete = true;

      trace?.update({
        output: { content: state.accumulated, chunks: state.chunksSent },
        metadata: { duration: Date.now() - startTime },
      });
      trace?.end();

      return {
        content: state.accumulated,
        chunksSent: state.chunksSent,
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      state.error = errorMessage;

      trace?.update({
        output: { error: errorMessage },
        metadata: { duration: Date.now() - startTime },
      });
      trace?.end();

      logger.error('Streaming failed', { streamId, error: errorMessage });

      return {
        content: state.accumulated,
        chunksSent: state.chunksSent,
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    } finally {
      // Clean up stream state
      this.activeStreams.delete(streamId);
    }
  }

  /**
   * Flush pending content as a chunk
   */
  private async flushChunk(
    streamId: string,
    onChunk: StreamCallback,
    state: StreamState,
    accumulate: boolean,
  ): Promise<void> {
    if (state.pending.length === 0) return;

    const chunk: StreamChunk = {
      content: state.pending,
      isFinal: false,
      index: state.chunksSent++,
      timestamp: new Date(),
    };

    if (accumulate) {
      state.accumulated += state.pending;
    }
    state.pending = '';
    state.lastSentAt = new Date();

    try {
      await onChunk(chunk);
    } catch (error) {
      logger.error('Failed to send chunk', { streamId, error });
    }
  }

  /**
   * Get stream state by ID
   */
  getStreamState(streamId: string): StreamState | undefined {
    return this.activeStreams.get(streamId);
  }

  /**
   * Cancel an active stream
   */
  cancelStream(streamId: string): boolean {
    const state = this.activeStreams.get(streamId);
    if (state) {
      state.complete = true;
      state.error = 'Stream cancelled by user';
      this.activeStreams.delete(streamId);
      return true;
    }
    return false;
  }

  /**
   * Get count of active streams
   */
  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }
}

/**
 * Create a streamer instance
 */
export function createStreamer(ai: GoogleGenAI, langfuse?: LangfuseService | null): Streamer {
  return new Streamer(ai, langfuse);
}

/**
 * Create a chunk sender for a specific platform
 *
 * This helper creates a callback that sends chunks to the user
 * via the appropriate bot service.
 */
export function createChunkSender(
  platform: 'slack' | 'telegram',
  chatId: string,
  sendMessage: (chatId: string, text: string, options?: { parseMode?: string }) => Promise<void>,
): StreamCallback {
  let lastMessage = '';

  return async (chunk: StreamChunk) => {
    if (chunk.isFinal) {
      // Send any remaining content
      if (lastMessage) {
        await sendMessage(chatId, lastMessage);
        lastMessage = '';
      }
      return;
    }

    if (chunk.content) {
      lastMessage += chunk.content;

      // Send if we have enough content or if there's a natural break
      if (lastMessage.length >= 200 || /\n/.test(chunk.content)) {
        await sendMessage(chatId, lastMessage);
        lastMessage = '';
      }
    }
  };
}
