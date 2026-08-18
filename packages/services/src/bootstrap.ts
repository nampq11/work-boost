// Shared service initialization for both entrypoints (api and cli)

import { type Brain, initBrain } from '@work-boost/brain';
import { Database } from '@work-boost/data-provider';
import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { initLangfuse } from '@work-boost/shared/observability/index.ts';
import { Slack } from './slack/slack.ts';
import { TelegramService } from './telegram/telegram.ts';

export interface Services {
  db: Database;
  agent: Brain;
  slack: Slack;
  telegram: TelegramService;
}

/**
 * Validate required secrets before starting services.
 * With strict=true, all bot tokens are required regardless of environment.
 */
export function validateRequiredSecrets(options: { strict?: boolean } = {}): {
  valid: boolean;
  missing: string[];
} {
  const isProduction = env.DENO_ENV === 'production';
  // TelegramService is constructed unconditionally and throws without these, so
  // they are required in every environment (unlike the Slack secrets)
  const required: string[] = ['GOOGLE_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'];

  // In production or strict mode, require all bot secrets
  if (isProduction || options.strict) {
    required.push('SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET');
  }

  const missing = required.filter((secret) => !env.get(secret));
  return { valid: missing.length === 0, missing };
}

/**
 * Initialize database, Langfuse tracing, agent, and bot services.
 */
export async function initializeServices(options: { strict?: boolean } = {}): Promise<Services> {
  const validation = validateRequiredSecrets(options);
  if (!validation.valid) {
    throw new Error('Missing required secrets: ' + validation.missing.join(', '));
  }

  logger.info('Initializing services...');
  const db = await Database.init();
  logger.info('Database connected');

  // Initialize Langfuse tracing before Brain (for LLM call tracing)
  const langfuse = initLangfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    host: env.LANGFUSE_HOST,
    enabled: env.LANGFUSE_ENABLED,
  });
  if (langfuse.isEnabled()) {
    logger.info('Langfuse tracing enabled');
  } else {
    logger.debug('Langfuse tracing disabled');
  }

  const agent = await initBrain(env.get('GOOGLE_API_KEY') || '', { langfuse });
  logger.info('Agent initialized');

  const slack = new Slack(langfuse);
  const telegram = new TelegramService(db, agent, langfuse);
  logger.info('Bot services initialized');

  return { db, agent, slack, telegram };
}
