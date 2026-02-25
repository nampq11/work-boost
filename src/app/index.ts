/// <reference lib="deno.unstable" />
import { env } from '../core/env.ts';
import { logger } from '../core/logger/logger.ts';
import { Database, initBrain } from '../core/services/index.ts';
import { runMigrationIfNeeded } from '../core/services/database/migrate-slack-users.ts';
import { startDailyScheduler } from '../core/services/scheduler/daily-job.ts';
import { Slack } from '../core/services/slack/slack.ts';
import { TelegramService } from '../core/services/telegram/telegram.ts';
import { createServer } from './api/server.ts';

export interface StartApiModeOptions {
  port: number;
  host: string;
  apiPrefix: string;
  enableScheduler?: boolean;
}

/**
 * Validate required secrets before starting services
 */
function validateRequiredSecrets(): { valid: boolean; missing: string[] } {
  try {
    const isProduction = env.DENO_ENV === 'production';
    const required: string[] = [];
    const missing: string[] = [];

    // Always require Google API key
    required.push('GOOGLE_API_KEY');

    // In production, require all bot secrets
    if (isProduction) {
      required.push(
        'SLACK_BOT_TOKEN',
        'SLACK_SIGNING_SECRET',
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_WEBHOOK_SECRET',
      );
    }

    for (const secret of required) {
      const value = env.get(secret);
      if (!value) {
        missing.push(secret);
      }
    }

    return { valid: missing.length === 0, missing };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error validating secrets: ' + errorMsg);
    return { valid: false, missing: [] };
  }
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

  // Validate required secrets before initializing services
  console.log('[DEBUG] Validating required secrets...');
  const secretValidation = validateRequiredSecrets();
  console.log('[DEBUG] Secret validation result:', secretValidation);
  if (!secretValidation.valid) {
    const missingMsg = 'Missing required secrets: ' + secretValidation.missing.join(', ');
    console.error('[ERROR] ' + missingMsg);
    throw new Error(missingMsg);
  }

  // Initialize services
  console.log('[DEBUG] Initializing services...');
  logger.info('Initializing services...');
  const db = await Database.init();
  logger.info('Database connected');

  const agent = await initBrain(env.get('GOOGLE_API_KEY') || '');
  logger.info('Agent initialized');

  const slack = new Slack();
  const telegram = new TelegramService(db, agent);
  logger.info('Bot services initialized');

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
    Deno.exit(1);
  }
}

// Start server when run directly
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
  Deno.exit(1);
});
