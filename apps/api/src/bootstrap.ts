// Centralized service initialization for the Work Boost API server.

import { type AgentPort, createBrain } from '@work-boost/brain';
import { Database, createDataLayer } from '@work-boost/data-provider';
import { SlackService } from '@work-boost/services/slack/slack.ts';
import { TelegramService } from '@work-boost/services/telegram/telegram.ts';
import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';

export interface Services {
  db: Database;
  agent: AgentPort;
  slack: SlackService;
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
  const required: string[] = [
    'GOOGLE_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'TELEGRAM_OWNER_ID',
  ];

  if (isProduction || options.strict) {
    required.push('SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET');
  }

  const missing = required.filter((secret) => !env.get(secret));
  return { valid: missing.length === 0, missing };
}

/**
 * Initialize the singleton DataLayer, Database facade, Brain agent, and bot services.
 */
export async function initializeServices(options: { strict?: boolean } = {}): Promise<Services> {
  const validation = validateRequiredSecrets(options);
  if (!validation.valid) {
    throw new Error('Missing required secrets: ' + validation.missing.join(', '));
  }

  logger.info('Initializing services...');

  const dataLayer = createDataLayer();
  await dataLayer.fs.init();
  await dataLayer.config.load();
  logger.info('Markdown-based workspace initialized');

  const db = await Database.init(dataLayer);

  const agent = createBrain({
    apiKey: env.get('GOOGLE_API_KEY') || '',
    dataLayer,
  });
  logger.info('Agent initialized');

  const slack = new SlackService();
  const telegram = new TelegramService(db, agent);
  logger.info('Bot services initialized');

  return { db, agent, slack, telegram };
}
