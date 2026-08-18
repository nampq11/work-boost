import { runMigrationIfNeeded } from '@work-boost/data-provider';
import { initializeServices } from '@work-boost/services';
import { startDailyScheduler } from '@work-boost/services/scheduler/daily-job.ts';
/// <reference lib="deno.unstable" />
import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { createServer } from './api/server.ts';

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
  const { db, agent, slack, telegram } = await initializeServices();

  // Run migration BEFORE server starts (fail-fast if migration fails)
  logger.info('Running database migration if needed...');
  await runMigrationIfNeeded(db);

  const server = createServer({
    port,
    host,
    corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
    rateLimitMaxRequests: 100,
    rateLimitWindowMs: 15 * 60 * 1000,
    enableWebSocket: false,
    apiPrefix,
    slack,
    telegram,
    db,
    agent,
  });

  try {
    server.start();
    logger.info('API server is running and ready to accept requests', undefined, 'green');

    // Start daily scheduler after successful server start
    if (enableScheduler) {
      try {
        await startDailyScheduler({
          db,
          agent,
          slackBot: slack,
          telegramBot: telegram,
        });
        logger.info('Daily scheduler started');
      } catch (schedulerError) {
        logger.error('Failed to start scheduler', { error: schedulerError });
      }
    }
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
