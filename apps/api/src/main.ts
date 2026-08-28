import { seedHtmlApps } from '@work-boost/runtime';
/// <reference lib="deno.unstable" />
import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { initializeServices } from './bootstrap.ts';
import { createServer } from './server.ts';

// Origins the desktop shell (Tauri 2) uses for its webview. The server only grants CORS to exact
// allowlist entries for these; its http-localhost fallback does not match `tauri://localhost` (non-http
// protocol) or `http://tauri.localhost` (hostname is not localhost/127.0.0.1).
const CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'tauri://localhost',
  'http://tauri.localhost',
];

function resolveApiHost(defaultHost: string): string {
  return Deno.env.get('WORKBOOST_HOST') ?? defaultHost;
}

function resolveApiPort(defaultPort: number): number {
  const rawPort = Deno.env.get('WORKBOOST_PORT');
  if (rawPort === undefined) return defaultPort;
  if (rawPort === '0') {
    // Special value: let OS assign a free port (for Tauri sidecar)
    return 0;
  }
  const parsedPort = Number(rawPort);
  if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
    return parsedPort;
  }
  logger.warn(`Invalid WORKBOOST_PORT '${rawPort}'; falling back to ${defaultPort}`);
  return defaultPort;
}

function resolveApiPrefix(defaultPrefix: string): string {
  const configuredPrefix = Deno.env.get('WORKBOOST_API_PREFIX');
  if (configuredPrefix === undefined) {
    return defaultPrefix;
  }
  if (configuredPrefix === '""') {
    return '';
  }
  return configuredPrefix;
}

function resolvePositiveInt(name: string, fallback: number): number {
  const rawValue = Deno.env.get(name);
  if (rawValue === undefined) return fallback;
  const parsed = Number(rawValue);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  logger.warn(`Invalid ${name} '${rawValue}'; falling back to ${fallback}`);
  return fallback;
}

export function resolveRateLimit(defaults: { maxRequests: number; windowMs: number }): {
  maxRequests: number;
  windowMs: number;
} {
  return {
    maxRequests: resolvePositiveInt('WORKBOOST_RATE_LIMIT_MAX', defaults.maxRequests),
    windowMs: resolvePositiveInt('WORKBOOST_RATE_LIMIT_WINDOW_MS', defaults.windowMs),
  };
}

export interface StartApiModeOptions {
  port: number;
  host: string;
  apiPrefix: string;
  enableScheduler?: boolean;
}

/**
 * Start the API server with all services initialized
 */
export async function startApiMode(options: StartApiModeOptions): Promise<void> {
  const port = options.port;
  const host = options.host;
  const apiPrefix = resolveApiPrefix(options.apiPrefix);
  const enableScheduler = options.enableScheduler !== false;

  logger.info('Starting API server on http://' + host + ':' + port + apiPrefix, undefined, 'green');
  logger.debug(`Environment DENO_ENV: ${env.DENO_ENV}`);
  logger.debug(`AI_PROVIDER: ${env.get('AI_PROVIDER') || 'workspace/default'}`);
  logger.debug(`AI_MODEL: ${env.get('AI_MODEL') || 'workspace/default'}`);

  // Initialize services (validates required secrets first)
  const { db, agent, auth, aiConfig, extensionManager } = await initializeServices({
    enableScheduler,
    apiPrefix,
  });
  const seededApps = await seedHtmlApps(db.fs);
  if (seededApps.length > 0) {
    logger.info('Seeded HTML Apps into workspace: ' + seededApps.join(', '), undefined, 'green');
  }

  const server = createServer({
    port,
    host,
    corsOrigins: CORS_ORIGINS,
    ...resolveRateLimit({ maxRequests: 100, windowMs: 15 * 60 * 1000 }),
    enableWebSocket: false,
    apiPrefix,
    db,
    agent,
    auth,
    aiConfig,
    extensionManager,
  });

  await server.start();
  logger.info('API server is running and ready to accept requests', undefined, 'green');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}; shutting down extensions`);
    try {
      await server.stop();
    } finally {
      Deno.exit(0);
    }
  };
  Deno.addSignalListener('SIGINT', () => void shutdown('SIGINT'));
  Deno.addSignalListener('SIGTERM', () => void shutdown('SIGTERM'));
}

export async function main() {
  const port = resolveApiPort(3001);
  const host = resolveApiHost('0.0.0.0');
  const apiPrefix = resolveApiPrefix('/api');

  await startApiMode({
    port,
    host,
    apiPrefix,
    enableScheduler: true,
  });
}

// Start the server when run directly by Deno or as the compiled desktop sidecar.
if (import.meta.main) {
  main().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('=== API SERVER START FAILED ===');
    console.error('Error:', errorMessage);
    if (errorStack) console.error('Stack:', errorStack);
    logger.error('Failed to start API server: ' + errorMessage);
    Deno.exit(1);
  });
}
