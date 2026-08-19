import { type AgentPort, createBrain } from '@work-boost/brain';
import { type DataLayer, Database, createDataLayer } from '@work-boost/data-provider';
import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';
import {
  ExtensionManager,
  loadUserPlugins,
  schedulerExtension,
  slackExtension,
  telegramExtension,
} from '../../../extensions/mod.ts';

export interface Services {
  dataLayer: DataLayer;
  db: Database;
  agent: AgentPort;
  extensionManager: ExtensionManager;
}

export function validateRequiredSecrets(options: { strict?: boolean } = {}): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const requireSecret = (name: string): void => {
    if (!env.get(name)) missing.push(name);
  };

  requireSecret('GOOGLE_API_KEY');

  const telegramEnabled = Boolean(env.get('TELEGRAM_BOT_TOKEN'));
  const slackEnabled = Boolean(env.get('SLACK_BOT_TOKEN'));
  const isProduction = env.DENO_ENV === 'production';

  if (telegramEnabled && (isProduction || options.strict)) {
    requireSecret('TELEGRAM_WEBHOOK_SECRET');
    requireSecret('TELEGRAM_OWNER_ID');
  }
  if (slackEnabled && (isProduction || options.strict)) {
    requireSecret('SLACK_SIGNING_SECRET');
  }

  return { valid: missing.length === 0, missing };
}

export async function initializeServices(
  options: { strict?: boolean; enableScheduler?: boolean } = {},
): Promise<Services> {
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

  const context = {
    dataLayer,
    db,
    agent,
    logger,
    env,
  };
  const extensionManager = new ExtensionManager(context);

  if (env.get('TELEGRAM_BOT_TOKEN')) extensionManager.use(telegramExtension());
  if (env.get('SLACK_BOT_TOKEN')) extensionManager.use(slackExtension());
  extensionManager.use(schedulerExtension());

  await loadUserPlugins(extensionManager, context);
  await extensionManager.initAll();
  if (options.enableScheduler !== false) {
    extensionManager.registerAllCronJobs();
  }

  return { dataLayer, db, agent, extensionManager };
}
