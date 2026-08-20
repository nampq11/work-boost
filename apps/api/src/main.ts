import { seedHtmlApps } from '@work-boost/runtime';
/// <reference lib="deno.unstable" />
import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { initializeServices } from './bootstrap.ts';
import { createServer } from './server.ts';

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
  const apiPrefix =
    Deno.env.get('WORKBOOST_API_PREFIX') !== undefined
      ? Deno.env.get('WORKBOOST_API_PREFIX') === '""'
        ? ''
        : Deno.env.get('WORKBOOST_API_PREFIX')!
      : options.apiPrefix;
  const enableScheduler = options.enableScheduler !== false;

  logger.info('Starting API server on http://' + host + ':' + port + apiPrefix, undefined, 'green');
  console.log('[DEBUG] Environment DENO_ENV:', env.DENO_ENV);
  console.log('[DEBUG] GOOGLE_API_KEY set:', !!env.get('GOOGLE_API_KEY'));

  // Initialize services (validates required secrets first)
  const { db, agent, extensionManager } = await initializeServices({ enableScheduler });
  const seededApps = await seedHtmlApps(db.fs);
  if (seededApps.length > 0) {
    logger.info('Seeded HTML Apps into workspace: ' + seededApps.join(', '), undefined, 'green');
  }
  const server = createServer({
    port,
    host,
    corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
    rateLimitMaxRequests: 100,
    rateLimitWindowMs: 15 * 60 * 1000,
    enableWebSocket: false,
    apiPrefix,
    db,
    agent,
    extensionManager,
  });

  try {
    server.start();
    logger.info('API server is running and ready to accept requests', undefined, 'green');
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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('=== API SERVER START FAILED ===');
    console.error('Error:', errorMsg);
    if (errorStack) console.error('Stack:', errorStack);
    logger.error('Failed to start API server: ' + errorMsg);
    throw error;
  }
}

// Start server when run directly (not when imported by the CLI)
if (import.meta.main) {
  startApiMode({
    port: 3001,
    host: '0.0.0.0',
    apiPrefix: '/api',
  }).catch((error) => {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('=== API SERVER START FAILED ===');
    console.error('Error:', errorMsg);
    if (errorStack) console.error('Stack:', errorStack);
    logger.error('Failed to start API server: ' + errorMsg);
    // Rethrow so startup failure exits with a non-zero code instead of resolving silently
    throw error;
  });
}
