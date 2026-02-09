/**
 * @module storage/manager
 */

/**
 * Health check result for storage backends
 */
export interface HealthCheckResult {
  cache: boolean;
  database: boolean;
  overall: boolean;
  details?: {
    cache?: { status: string; latency?: number; error?: string };
    database?: { status: string; latency?: number; error?: string };
  };
}

/**
 * Storage system information
 */
export interface StorageInfo {
  connected: boolean;
  backends: {
    cache: {
      type: string;
      connected: boolean;
      fallback: boolean;
    };
    database: {
      type: string;
      connected: boolean;
      fallback: boolean;
    };
  };
  connectionAttempts: number;
  lastError: string | undefined;
}

/**
 * Storage Manager
 */
export class StorageManager {
  // Core state
  // private cache: CacheBackend;
}
