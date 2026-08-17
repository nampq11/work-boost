export { Database } from '../storage/database.ts';

// Re-export Brain as Agent for backward compatibility
export { Brain, initBrain } from '../brain/index.ts';
export type { AgentPort as Agent } from '../ports/agent.ts';

// Re-export observability services
export * from '../observability/index.ts';
