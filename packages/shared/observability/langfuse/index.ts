/**
 * Langfuse Observability Module
 *
 * Exports the Langfuse tracing service for integration
 * with other components (Brain, BotServices).
 */

export type {
  CreateGenerationOptions,
  CreateSpanOptions,
  CreateTraceOptions,
  LangfuseConfig,
  LangfuseGeneration,
  LangfuseSpan,
  LangfuseTrace,
  LangfuseTracer,
  LangfuseServiceConfig,
  TraceMetadata,
} from './types.ts';

export {
  getLangfuse,
  initLangfuse,
  resetLangfuse,
} from './langfuse.ts';

// Re-export the class for type access
export type { LangfuseService } from './langfuse.ts';
