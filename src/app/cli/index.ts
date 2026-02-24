#!/usr/bin/env -S deno run --allow-all --unstable-kv --unstable-cron

/**
 * Work Boost CLI
 *
 * Command-line interface for the Work Boost bot.
 * Supports starting the server, managing database, and health checks.
 */

import { Command } from 'commander';
import type { Brain } from '../../core/brain/index.ts';
import { env } from '../../core/env.ts';
import { logger } from '../../core/logger/logger.ts';
import { Database, initBrain } from '../../core/services/_index.ts';
import { runMigrationIfNeeded } from '../../core/services/database/migrate-slack-users.ts';
import { startDailyScheduler } from '../../core/services/scheduler/daily-job.ts';
import { Slack } from '../../core/services/slack/slack.ts';
import { TelegramService } from '../../core/services/telegram/telegram.ts';
import { startApiMode } from '../index.ts';

const program = new Command();

program
  .name('work-boost')
  .description('Work Boost - Personal AI assistant for Slack and Telegram')
  .version('0.1.0');

/**
 * Validate required secrets before starting services
 */
function validateRequiredSecrets(strict = true): { valid: boolean; missing: string[] } {
  const isProduction = env.DENO_ENV === 'production';
  const required: string[] = [];
  const missing: string[] = [];

  // Always require Google API key
  required.push('GOOGLE_API_KEY');

  // In production or strict mode, require all bot secrets
  if (isProduction || strict) {
    required.push('SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'TELEGRAM_BOT_TOKEN');
  }

  for (const secret of required) {
    const value = env.get(secret as any);
    if (!value) {
      missing.push(secret);
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Initialize bot services
 */
async function initializeServices() {
  const validation = validateRequiredSecrets();
  if (!validation.valid) {
    throw new Error('Missing required secrets: ' + validation.missing.join(', '));
  }

  logger.info('Initializing services...');
  const db = await Database.init();
  logger.info('Database connected');

  const brain = await initBrain(env.GOOGLE_API_KEY || '');
  logger.info('Agent initialized');

  const slack = new Slack();
  const telegram = new TelegramService(db, brain);
  logger.info('Bot services initialized');

  return { db, brain, slack, telegram };
}

/**
 * Start command - Start the API server
 */
program
  .command('start')
  .description('Start the Work Boost API server')
  .option('-p, --port <number>', 'Server port', '3001')
  .option('-h, --host <address>', 'Server host', 'localhost')
  .option('--api-prefix <path>', 'API prefix', '/api')
  .option('--no-scheduler', 'Disable daily scheduler')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const host = options.host;
    const apiPrefix = options.apiPrefix;
    const enableScheduler = options.scheduler !== false;

    logger.info(`Starting Work Boost server on http://${host}:${port}${apiPrefix}`);

    try {
      await startApiMode({ port, host, apiPrefix, enableScheduler });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start server:', { error: errorMsg });
      Deno.exit(1);
    }
  });

/**
 * Dev command - Start in development mode
 */
program
  .command('dev')
  .description('Start in development mode with hot reload')
  .option('-p, --port <number>', 'Server port', '3001')
  .option('-h, --host <address>', 'Server host', 'localhost')
  .action(async (options) => {
    logger.info('Starting in development mode...');
    logger.info('Note: For hot reload, use `deno task dev` instead');

    const port = parseInt(options.port, 10);
    const host = options.host;

    await startApiMode({ port, host, apiPrefix: '/api' });
  });

/**
 * DB:Migrate command - Run database migrations
 */
program
  .command('db:migrate')
  .description('Run database migrations')
  .action(async () => {
    logger.info('Running database migrations...');

    try {
      const validation = validateRequiredSecrets(false);
      if (!validation.valid) {
        logger.warn('Skipping migration (missing secrets): ' + validation.missing.join(', '));
        return;
      }

      const { db } = await initializeServices();
      await runMigrationIfNeeded(db);
      logger.info('Migration completed successfully');
      Deno.exit(0);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Migration failed:', { error: errorMsg });
      Deno.exit(1);
    }
  });

/**
 * DB:Reset command - Reset database (development only)
 */
program
  .command('db:reset')
  .description('Reset database (development only)')
  .option('--confirm', 'Confirm reset without prompt')
  .action(async (options) => {
    const isProduction = env.DENO_ENV === 'production';
    if (isProduction) {
      logger.error('Database reset is not allowed in production');
      Deno.exit(1);
    }

    if (!options.confirm) {
      logger.warn('This will delete all data in the database.');
      logger.warn('Use --confirm to proceed without this prompt.');
      Deno.exit(1);
    }

    logger.info('Resetting database...');

    try {
      const kvPath = `${Deno.env.get('HOME') || '.'}/.deno/deno_kv_`;
      const command = new Deno.Command('rm', {
        args: ['-rf', kvPath],
      });
      await command.output();
      logger.info('Database reset completed');
      Deno.exit(0);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Database reset failed:', { error: errorMsg });
      Deno.exit(1);
    }
  });

/**
 * Health command - Check bot health and configuration
 */
program
  .command('health')
  .description('Check bot health and configuration')
  .action(async () => {
    logger.info('Checking Work Boost health...');

    const checks: { name: string; status: 'ok' | 'error'; message?: string }[] = [];

    // Check environment
    const envName = env.DENO_ENV || 'development';
    checks.push({ name: 'Environment', status: 'ok', message: envName });

    // Check required secrets
    const secretValidation = validateRequiredSecrets(false);
    if (secretValidation.valid) {
      checks.push({ name: 'Required Secrets', status: 'ok' });
    } else {
      checks.push({
        name: 'Required Secrets',
        status: 'error',
        message: `Missing: ${secretValidation.missing.join(', ')}`,
      });
    }

    // Check optional secrets
    const optionalSecrets = {
      SLACK_BOT_TOKEN: env.get('SLACK_BOT_TOKEN'),
      SLACK_SIGNING_SECRET: env.get('SLACK_SIGNING_SECRET'),
      TELEGRAM_BOT_TOKEN: env.get('TELEGRAM_BOT_TOKEN'),
      TELEGRAM_WEBHOOK_SECRET: env.get('TELEGRAM_WEBHOOK_SECRET'),
    };

    for (const [name, value] of Object.entries(optionalSecrets)) {
      checks.push({
        name: name,
        status: value ? 'ok' : ('warning' as any),
        message: value ? 'Configured' : 'Not configured',
      });
    }

    // Check database connection
    try {
      const db = await Database.init();
      checks.push({ name: 'Database', status: 'ok', message: 'Connected' });
      await db.close?.();
    } catch (error) {
      checks.push({
        name: 'Database',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // Check AI agent
    try {
      await initBrain(env.GOOGLE_API_KEY || '');
      checks.push({ name: 'AI Agent', status: 'ok', message: 'Initialized' });
    } catch (error) {
      checks.push({
        name: 'AI Agent',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // Print results
    console.log('');
    for (const check of checks) {
      const status = check.status === 'ok' ? '✓' : check.status === 'warning' ? '⚠' : '✗';
      const statusColor =
        check.status === 'ok' ? 'green' : check.status === 'warning' ? 'yellow' : 'red';
      logger.info(
        `${status} ${check.name}: ${check.message || check.status}`,
        undefined,
        statusColor,
      );
    }

    const hasErrors = checks.some((c) => c.status === 'error');
    Deno.exit(hasErrors ? 1 : 0);
  });

/**
 * Scheduler:Run command - Run the daily scheduler once
 */
program
  .command('scheduler:run')
  .description('Run the daily scheduler once (for testing)')
  .action(async () => {
    logger.info('Running daily scheduler...');

    try {
      const { db, brain, slack, telegram } = await initializeServices();

      // Run migration before scheduler
      await runMigrationIfNeeded(db);

      await startDailyScheduler({
        db,
        agent: brain,
        slackBot: slack,
        telegramBot: telegram,
      });

      logger.info('Scheduler run completed');
      Deno.exit(0);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Scheduler run failed:', { error: errorMsg });
      Deno.exit(1);
    }
  });

/**
 * Bot:Webhook command - Set up webhooks
 */
program
  .command('bot:webhook')
  .description('Set up Telegram webhook')
  .option('-u, --url <url>', 'Webhook URL', 'http://localhost:3001/api/telegram/webhook')
  .option('-s, --secret <secret>', 'Webhook secret token', env.get('TELEGRAM_WEBHOOK_SECRET') || '')
  .action(async (options) => {
    const token = env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      logger.error('TELEGRAM_BOT_TOKEN is required');
      Deno.exit(1);
    }

    const url = options.url;
    const secret = options.secret;

    logger.info(`Setting Telegram webhook to: ${url}`);

    try {
      const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;
      const payload = JSON.stringify({ url, secret_token: secret || undefined });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const result = await response.json();

      if (result.ok) {
        logger.info('Webhook set successfully');
        Deno.exit(0);
      } else {
        logger.error('Failed to set webhook:', { error: result.description });
        Deno.exit(1);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Webhook setup failed:', { error: errorMsg });
      Deno.exit(1);
    }
  });

/**
 * Bot:Info command - Get bot information
 */
program
  .command('bot:info')
  .description('Get bot information from Telegram/Slack APIs')
  .action(async () => {
    // Get Telegram bot info
    const telegramToken = env.get('TELEGRAM_BOT_TOKEN');
    if (telegramToken) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${telegramToken}/getMe`);
        const result = await response.json();

        if (result.ok) {
          const bot = result.result;
          console.log('\n=== Telegram Bot Info ===');
          console.log(`ID: ${bot.id}`);
          console.log(`Name: ${bot.first_name} ${bot.last_name || ''}`);
          console.log(`Username: @${bot.username}`);
          console.log(`Can join groups: ${bot.can_join_groups}`);
          console.log(`Can read all group messages: ${bot.can_read_all_group_messages}`);
          console.log(`Supports inline queries: ${bot.supports_inline_queries}`);
        }
      } catch (error) {
        logger.error('Failed to get Telegram bot info');
      }
    } else {
      logger.warn('Telegram bot token not configured');
    }

    // Slack doesn't have a simple getMe endpoint, requires auth.test
    const slackToken = env.get('SLACK_BOT_TOKEN');
    if (slackToken) {
      try {
        const response = await fetch('https://slack.com/api/auth.test', {
          headers: { Authorization: `Bearer ${slackToken}` },
        });
        const result = await response.json();

        if (result.ok) {
          console.log('\n=== Slack Bot Info ===');
          console.log(`Team: ${result.team}`);
          console.log(`User: ${result.user}`);
          console.log(`Team ID: ${result.team_id}`);
          console.log(`User ID: ${result.user_id}`);
        }
      } catch (error) {
        logger.error('Failed to get Slack bot info');
      }
    } else {
      logger.warn('Slack bot token not configured');
    }

    Deno.exit(0);
  });

/**
 * Chat command - Interactive chat mode with the AI brain
 */
program
  .command('chat')
  .description('Interactive chat mode with the AI brain')
  .option('-s, --session <id>', 'Session ID for conversation history')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (options) => {
    const validation = validateRequiredSecrets(false);
    if (!validation.valid) {
      logger.error('Missing required secrets:', { error: validation.missing.join(', ') });
      logger.info('Note: Only GOOGLE_API_KEY is required for chat mode');
      Deno.exit(1);
    }

    logger.info('Starting Work Boost chat mode...');
    const brain = await initBrain(env.GOOGLE_API_KEY || '');
    logger.info('Brain initialized');

    // Create or load session
    let sessionId = options.session || 'cli-chat';
    await brain.createSession(sessionId);
    logger.info(`Session: ${sessionId}`);

    // Print welcome message
    console.log('\n╭─────────────────────────────────────────────────────────╮');
    console.log('│  Work Boost Interactive Chat                            │');
    console.log('│  Type your message and press Enter to chat              │');
    console.log('│  Type /exit or /quit to exit                            │');
    console.log('│  Type /clear to clear conversation history              │');
    console.log('│  Type /help for available commands                      │');
    console.log('╰─────────────────────────────────────────────────────────╯\n');

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(1024);

    let shouldExit = false;

    while (!shouldExit) {
      // Display prompt
      Deno.stdout.writeSync(encoder.encode('🧠 You: '));

      // Read input
      const n = await Deno.stdin.read(buffer);
      if (n === null) {
        // EOF (Ctrl+D)
        console.log('\nExiting...');
        break;
      }

      const input = decoder.decode(buffer.subarray(0, n)).trim();

      if (!input) {
        continue;
      }

      // Handle commands
      if (input.startsWith('/')) {
        const [command, ...args] = input.split(' ');

        switch (command) {
          case '/exit':
          case '/quit':
            shouldExit = true;
            console.log('Goodbye! 👋');
            break;
          case '/clear':
            brain.clearSession(sessionId);
            console.log('Conversation history cleared.');
            break;
          case '/help':
            console.log('\nAvailable commands:');
            console.log('  /exit, /quit    - Exit chat mode');
            console.log('  /clear          - Clear conversation history');
            console.log('  /sessions       - List all sessions');
            console.log('  /history        - Show conversation history');
            console.log('  /capabilities   - List available capabilities');
            console.log('  /session <id>   - Switch to a different session');
            console.log('  /verbose        - Toggle verbose mode');
            console.log('  /help           - Show this help message\n');
            break;
          case '/sessions':
            const sessions = brain.listSessions();
            console.log('\nSessions:');
            if (sessions.length === 0) {
              console.log('  (none)');
            } else {
              for (const s of sessions) {
                const current = s === sessionId ? ' (current)' : '';
                console.log(`  - ${s}${current}`);
              }
            }
            console.log('');
            break;
          case '/history': {
            const messages = brain.getSessionMessages(sessionId);
            console.log('\nConversation history:');
            if (messages.length === 0) {
              console.log('  (empty)');
            } else {
              for (const msg of messages) {
                const prefix = msg.role === 'user' ? 'You' : 'AI';
                console.log(`  ${prefix}: ${msg.content}`);
              }
            }
            console.log('');
            break;
          }
          case '/capabilities': {
            const caps = brain.getCapabilities();
            console.log('\nAvailable capabilities:');
            for (const cap of caps) {
              console.log(`  - ${cap.id}: ${cap.description}`);
            }
            console.log('');
            break;
          }
          case '/session':
            if (args[0]) {
              await brain.createSession(args[0]);
              sessionId = args[0];
              console.log(`Switched to session: ${sessionId}`);
            } else {
              console.log('Usage: /session <id>');
            }
            break;
          case '/verbose':
            options.verbose = !options.verbose;
            console.log(`Verbose mode: ${options.verbose ? 'enabled' : 'disabled'}`);
            break;
          default:
            console.log(`Unknown command: ${command}`);
            console.log('Type /help for available commands');
        }
        continue;
      }

      // Send message to brain
      try {
        const startTime = Date.now();
        const result = await brain.run(input, {
          sessionId,
          verbose: options.verbose,
        });
        const elapsed = Date.now() - startTime;

        // Display response
        console.log(`\n🤖 AI: ${result.response}`);

        if (options.verbose) {
          console.log(`\n⏱️  Response time: ${elapsed}ms`);
        }
        console.log('');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Error processing message:', { error: errorMsg });
      }
    }

    Deno.exit(0);
  });

// Parse arguments
// Note: When using Deno, we need to specify { from: 'user' } so Commander.js
// treats the arguments as user-supplied command arguments, not script path
await program.parseAsync(Deno.args, { from: 'user' });
