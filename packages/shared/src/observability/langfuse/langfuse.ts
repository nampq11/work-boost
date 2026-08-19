/**
 * Langfuse Observability Service
 *
 * Singleton service for tracing LLM calls, bot messages, and request lifecycle.
 * Follows existing patterns from Logger and Brain services.
 *
 * Graceful degradation: When disabled or misconfigured, tracing becomes a no-op.
 */

import { logger } from '../../logger/logger.ts';
import type {
  CreateGenerationOptions,
  CreateSpanOptions,
  CreateTraceOptions,
  LangfuseConfig,
  LangfuseGeneration,
  LangfuseServiceConfig,
  LangfuseSpan,
  LangfuseTrace,
  LangfuseTracer,
  TraceMetadata,
} from './types.ts';

type LangfuseClient = InstanceType<typeof import('langfuse').Langfuse>;
type LangfuseTraceClient = ReturnType<LangfuseClient['trace']>;
type LangfuseSpanClient = ReturnType<LangfuseTraceClient['span']>;
type LangfuseGenerationClient = ReturnType<LangfuseTraceClient['generation']>;
type LangfuseMapValue = string | number | boolean | string[] | null;

function normalizeModelParameters(
  parameters?: Record<string, unknown>,
): Record<string, LangfuseMapValue> | undefined {
  if (!parameters) return undefined;

  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return [key, value];
      }

      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return [key, value];
      }

      return [key, JSON.stringify(value)];
    }),
  );
}

// ===== 1. No-op Tracer (Fallback) =====

/**
 * No-op span for when tracing is disabled
 */
class NoOpSpan implements LangfuseSpan {
  update(_options: { output?: unknown; metadata?: Record<string, unknown> }): void {
    // No-op
  }

  end(): void {
    // No-op
  }
}

/**
 * No-op generation for when tracing is disabled
 */
class NoOpGeneration extends NoOpSpan implements LangfuseGeneration {
  override update(_options: {
    output?: unknown;
    usageDetails?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    costDetails?: { totalCost?: number; currency?: string };
    metadata?: Record<string, unknown>;
  }): void {
    // No-op
  }
}

/**
 * No-op trace for when tracing is disabled
 */
class NoOpTrace implements LangfuseTrace {
  update(_options: {
    output?: unknown;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): void {
    // No-op
  }

  span(_options: CreateSpanOptions): LangfuseSpan {
    return new NoOpSpan();
  }

  generation(_options: CreateGenerationOptions): LangfuseGeneration {
    return new NoOpGeneration();
  }

  end(): void {
    // No-op
  }
}

// ===== 2. Langfuse SDK Integration =====

let LangfuseSDK: typeof import('langfuse') | null = null;
let LangfuseImportError: Error | null = null;

// Try to import Langfuse SDK (may fail in Deno)
try {
  LangfuseSDK = await import('langfuse');
  logger.debug('Langfuse SDK imported successfully');
} catch (error) {
  LangfuseImportError = error instanceof Error ? error : new Error(String(error));
  logger.warn('Langfuse SDK import failed, using no-op tracer', {
    error: LangfuseImportError.message,
  });
}

/**
 * Real Langfuse trace using SDK
 */
class LangfuseTraceImpl implements LangfuseTrace {
  private sdkTrace: LangfuseTraceClient;
  private metadata: TraceMetadata;

  constructor(sdkTrace: LangfuseTraceClient, metadata: TraceMetadata = {}) {
    this.sdkTrace = sdkTrace;
    this.metadata = metadata;
  }

  update(options: {
    output?: unknown;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): void {
    try {
      this.sdkTrace.update({
        output: options.output,
        metadata: { ...this.metadata.metadata, ...options.metadata },
        tags: options.tags,
      });
    } catch (error) {
      logger.warn('Failed to update Langfuse trace', { error });
    }
  }

  span(options: CreateSpanOptions): LangfuseSpan {
    try {
      const sdkSpan = this.sdkTrace.span({
        name: options.name,
        input: options.input,
        output: options.output,
        metadata: options.metadata,
      });
      return new LangfuseSpanImpl(sdkSpan);
    } catch (error) {
      logger.warn('Failed to create Langfuse span', { error });
      return new NoOpSpan();
    }
  }

  generation(options: CreateGenerationOptions): LangfuseGeneration {
    try {
      const sdkGeneration = this.sdkTrace.generation({
        name: options.name,
        input: options.input,
        output: options.output,
        model: options.model,
        modelParameters: normalizeModelParameters(options.modelParameters),
        startTime: options.startTime ? new Date(options.startTime) : undefined,
        metadata: options.metadata,
        usageDetails: options.usageDetails
          ? {
              promptTokens: options.usageDetails.promptTokens ?? 0,
              completionTokens: options.usageDetails.completionTokens ?? 0,
              totalTokens: options.usageDetails.totalTokens ?? 0,
            }
          : undefined,
        costDetails:
          options.costDetails?.totalCost !== undefined
            ? {
                total: options.costDetails.totalCost,
              }
            : undefined,
      });
      return new LangfuseGenerationImpl(sdkGeneration);
    } catch (error) {
      logger.warn('Failed to create Langfuse generation', { error });
      return new NoOpGeneration();
    }
  }

  end(): void {
    // Langfuse traces don't have an end() method - they're finalized automatically on flush
    // This method exists for API compatibility but is a no-op
  }
}

/**
 * Real Langfuse span using SDK
 */
class LangfuseSpanImpl implements LangfuseSpan {
  private sdkSpan: LangfuseSpanClient;

  constructor(sdkSpan: LangfuseSpanClient) {
    this.sdkSpan = sdkSpan;
  }

  update(options: { output?: unknown; metadata?: Record<string, unknown> }): void {
    try {
      this.sdkSpan.update({
        output: options.output,
        metadata: options.metadata,
      });
    } catch (error) {
      logger.warn('Failed to update Langfuse span', { error });
    }
  }

  end(): void {
    try {
      this.sdkSpan.end();
    } catch (error) {
      logger.warn('Failed to end Langfuse span', { error });
    }
  }
}

/**
 * Real Langfuse generation using SDK
 */
class LangfuseGenerationImpl extends LangfuseSpanImpl implements LangfuseGeneration {
  private sdkGeneration: LangfuseGenerationClient;

  constructor(sdkGeneration: LangfuseGenerationClient) {
    super(sdkGeneration as unknown as LangfuseSpanClient);
    this.sdkGeneration = sdkGeneration;
  }

  override update(options: {
    output?: unknown;
    usageDetails?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    costDetails?: { totalCost?: number; currency?: string };
    metadata?: Record<string, unknown>;
  }): void {
    try {
      this.sdkGeneration.update({
        output: options.output,
        usageDetails: options.usageDetails
          ? {
              promptTokens: options.usageDetails.promptTokens ?? 0,
              completionTokens: options.usageDetails.completionTokens ?? 0,
              totalTokens: options.usageDetails.totalTokens ?? 0,
            }
          : undefined,
        costDetails:
          options.costDetails?.totalCost !== undefined
            ? {
                total: options.costDetails.totalCost,
              }
            : undefined,
        metadata: options.metadata,
      });
    } catch (error) {
      logger.warn('Failed to update Langfuse generation', { error });
    }
  }

  override end(): void {
    try {
      this.sdkGeneration.end();
    } catch (error) {
      logger.warn('Failed to end Langfuse generation', { error });
    }
  }
}

// ===== 3. Langfuse Service Class =====

/**
 * Langfuse observability service
 *
 * Singleton service following Logger pattern:
 * - Export singleton instance, not class
 * - No-op mode when disabled or SDK unavailable
 * - Graceful error handling with logging
 */
export class LangfuseService implements LangfuseTracer {
  private config: LangfuseServiceConfig;
  private sdkInstance: LangfuseClient | null = null;
  private enabled: boolean;

  constructor(config: LangfuseServiceConfig = {}) {
    this.config = {
      ...config,
      host: config.host ?? 'https://cloud.langfuse.com',
      enabled: config.enabled ?? false,
    };
    this.enabled = Boolean(
      this.config.enabled &&
        !!this.config.publicKey &&
        !!this.config.secretKey &&
        LangfuseSDK !== null,
    );

    if (this.enabled && LangfuseSDK) {
      try {
        this.sdkInstance = new LangfuseSDK.Langfuse({
          publicKey: this.config.publicKey!,
          secretKey: this.config.secretKey!,
          baseUrl: this.config.host,
        });
        logger.info('Langfuse tracing enabled', { host: this.config.host });
      } catch (error) {
        logger.warn('Failed to initialize Langfuse SDK, using no-op tracer', { error });
        this.enabled = false;
      }
    } else {
      const reason = !this.config.enabled
        ? 'disabled by configuration'
        : !this.config.publicKey || !this.config.secretKey
          ? 'missing credentials'
          : 'SDK not available';
      logger.debug(`Langfuse tracing disabled: ${reason}`);
    }
  }

  /**
   * Create a new trace
   */
  createTrace(options: CreateTraceOptions): LangfuseTrace {
    if (!this.enabled || !this.sdkInstance) {
      return new NoOpTrace();
    }

    try {
      const sdkTrace = this.sdkInstance.trace({
        name: options.name,
        input: options.input,
        userId: options.userId,
        sessionId: options.sessionId,
        metadata: options.metadata,
        tags: options.tags,
      });
      return new LangfuseTraceImpl(sdkTrace, options);
    } catch (error) {
      logger.warn('Failed to create Langfuse trace', { error });
      return new NoOpTrace();
    }
  }

  /**
   * Flush pending traces to Langfuse
   */
  async flush(): Promise<void> {
    if (!this.enabled || !this.sdkInstance) {
      return;
    }

    try {
      await this.sdkInstance.flushAsync();
      logger.debug('Langfuse traces flushed');
    } catch (error) {
      logger.warn('Failed to flush Langfuse traces', { error });
    }
  }

  /**
   * Shutdown the tracer gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.enabled || !this.sdkInstance) {
      return;
    }

    try {
      await this.sdkInstance.shutdownAsync();
      logger.info('Langfuse tracer shut down');
    } catch (error) {
      logger.warn('Failed to shutdown Langfuse tracer', { error });
    }
  }

  /**
   * Check if tracing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the underlying SDK instance (for advanced usage)
   */
  getSdkInstance(): LangfuseClient | null {
    return this.sdkInstance;
  }
}

// ===== 4. Singleton Export =====

/**
 * Global Langfuse tracer instance
 * Initialized in app/index.ts
 */
let langfuseInstance: LangfuseService | null = null;

/**
 * Initialize the Langfuse service singleton
 */
export function initLangfuse(config: LangfuseServiceConfig): LangfuseService {
  if (!langfuseInstance) {
    langfuseInstance = new LangfuseService(config);
  }
  return langfuseInstance;
}

/**
 * Get the Langfuse service instance
 */
export function getLangfuse(): LangfuseService | null {
  return langfuseInstance;
}

/**
 * Reset the Langfuse service instance (for testing)
 */
export function resetLangfuse(): void {
  langfuseInstance = null;
}
