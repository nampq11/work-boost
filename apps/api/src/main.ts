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
  const parsedPort = Number(rawPort);
  if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
    return parsedPort;
  }
  console.warn(`[DEBUG] Invalid WORKBOOST_PORT '${rawPort}'; falling back to ${defaultPort}`);
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
  console.log('[DEBUG] Environment DENO_ENV:', env.DENO_ENV);
  console.log('[DEBUG] AI_PROVIDER:', env.get('AI_PROVIDER') || 'workspace/default');
  console.log('[DEBUG] AI_MODEL:', env.get('AI_MODEL') || 'workspace/default');

  // Initialize services (validates required secrets first)
  const { db, agent, auth, extensionManager } = await initializeServices({
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
    rateLimitMaxRequests: 100,
    rateLimitWindowMs: 15 * 60 * 1000,
    enableWebSocket: false,
    apiPrefix,
    db,
    agent,
    auth,
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

// Start server when run directly (not when imported by the CLI)
if (import.meta.main) {
  startApiMode({
    // The desktop shell passes WORKBOOST_HOST/WORKBOOST_PORT to the sidecar; standalone dev runs keep
    // the historical 0.0.0.0:3001 so the browser shell and `deno task dev` keep behaving as before.
    host: resolveApiHost('0.0.0.0'),
    port: resolveApiPort(3001),
    apiPrefix: '/api',
  }).catch((error) => {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('=== API SERVER START FAILED ===');
    console.error('Error:', errorMsg);
    if (errorStack) console.error('Stack:', errorStack);
    logger.error('Failed to start API server: ' + errorMsg);
    // Exit explicitly so startup failures do not become uncaught promise errors.
    Deno.exit(1);
  });
}
