#!/usr/bin/env node

// Fix EventTarget memory leak by setting max listeners early
import { EventEmitter } from 'node:events';
EventEmitter.defaultMaxListeners = 20;

// Increase AbortSignal max listeners to prevent memory leaks warnings
if (typeof globalThis !== 'undefined' && globalThis.EventTarget) {
  const originalAddEventListener = globalThis.EventTarget.prototype.addEventListener;
  const listenerCounts = new WeakMap();

  globalThis.EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === 'abort' && this.constructor.name === 'AbortSignal') {
      const currentCount = listenerCounts.get(this) || 0;
      if (currentCount >= 15) {
        console.warn('AbortSignal has ' + currentCount + ' listeners, potential memory leak');
      }
      listenerCounts.set(this, currentCount + 1);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
}

import { env } from '../core/env.ts';
import { logger } from '../core/logger/logger.ts';
import { Agent, Database } from '../services/_index.ts';
import { runMigrationIfNeeded } from '../services/database/migrate-slack-users.ts';
import { startDailyScheduler } from '../services/scheduler/daily-job.ts';
import { Slack } from '../services/slack/slack.ts';
import { TelegramService } from '../services/telegram/telegram.ts';
import { ApiServer } from './api/server.ts';

/**
 * Validate required secrets before starting services
 */
function validateRequiredSecrets(): { valid: boolean; missing: string[] } {
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
    const value = env.get(secret as any);
    if (!value) {
      missing.push(secret);
    }
  }

  return { valid: missing.length === 0, missing };
}

async function startApiMode(options: any): Promise<void> {
  const port = parseInt(options.port) || 3001;
  const host = options.host || 'localhost';
  const apiPrefix =
    process.env.WORKBOOST_API_PREFIX !== undefined
      ? process.env.WORKBOOST_API_PREFIX === '""'
        ? ''
        : process.env.WORKBOOST_API_PREFIX
      : options.apiPrefix;

  logger.info('Starting API server on http://' + host + ':' + port + apiPrefix, undefined, 'green');

  // Validate required secrets before initializing services
  const secretValidation = validateRequiredSecrets();
  if (!secretValidation.valid) {
    throw new Error('Missing required secrets: ' + secretValidation.missing.join(', '));
  }

  // Initialize services
  logger.info('Initializing services...');
  const db = await Database.init();
  logger.info('Database connected');

  const agent = await Agent.init(env.get('GOOGLE_API_KEY') || '');
  logger.info('Agent initialized');

  const slack = new Slack();
  const telegram = new TelegramService(db, agent);
  logger.info('Bot services initialized');

  // Run migration BEFORE server starts (fail-fast if migration fails)
  logger.info('Running database migration if needed...');
  await runMigrationIfNeeded(db);

  const apiServer = new ApiServer({
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
    await apiServer.start();
    logger.info('API server is running and ready to accept requests', undefined, 'green');

    // Start daily scheduler after successful server start
    try {
      await startDailyScheduler({
        db,
        agent,
        slackBot: slack,
        telegramBot: telegram,
      });
      logger.info('Daily scheduler started');
    } catch (schedulerError) {
      console.error('Failed to start scheduler:', schedulerError);
      logger.error('Failed to start scheduler', { error: schedulerError });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Failed to start API server:', error);
    logger.error('Failed to start API server:', { error: errorMsg });
    process.exit(1);
  }
}

startApiMode({
  port: 3001,
  host: 'localhost',
  apiPrefix: '/api',
}).catch((error) => {
  const errorMsg = error instanceof Error ? error.message : String(error);
  logger.error('Failed to start API server:', { error: errorMsg });
  process.exit(1);
});
