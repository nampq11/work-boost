/**
 * Memory Layer
 *
 * Exports for the memory module.
 */

export { LongTermMemory, createLongTermMemory } from './long-term-memory.ts';
export { WorkingMemory } from './working-memory.ts';
export type {
  MemoryEntry,
  MemoryRetrieveOptions,
  MemorySearchResult,
  MemoryStoreOptions,
  WorkingMemory as WorkingMemoryType,
} from './types.ts';
export type { LongTermMemory as LongTermMemoryType } from './long-term-memory.ts';
export { MemoryType } from './types.ts';
