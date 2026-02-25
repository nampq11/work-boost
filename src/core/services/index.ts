export { Database } from './database/database.ts';

// Re-export Brain as Agent for backward compatibility
export { Brain, initBrain } from '../brain/index.ts';
import type { Brain } from '../brain/index.ts';

// Type alias for backward compatibility
export type Agent = Brain;
