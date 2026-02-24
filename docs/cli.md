---
summary: 'Command-line interface for Work Boost bot: server management, database operations, health checks, bot configuration, and interactive chat mode'
read_when:
  - onboarding to the codebase
  - deploying or running Work Boost bot
  - troubleshooting bot issues
  - managing database or webhooks
  - testing AI brain interactively
title: 'CLI Documentation'
---

# CLI

The Work Boost CLI provides a unified interface for managing the bot server, database, health checks, and configuration.

## Installation & Setup

The CLI is built into the Work Boost application. No additional installation required.

### Running the CLI

```bash
# Using deno task
deno task cli --help

# Or directly with deno
deno run --allow-all --env-file=.env --unstable-kv --unstable-cron src/app/cli/index.ts --help
```

## Commands

### `start` - Start the API Server

Start the Work Boost API server with all services initialized.

```bash
deno task cli start [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | `3001` | Server port |
| `-h, --host <address>` | `localhost` | Server host |
| `--api-prefix <path>` | `/api` | API prefix |
| `--no-scheduler` | `false` | Disable daily scheduler |

**Examples:**

```bash
# Start with defaults (localhost:3001)
deno task cli start

# Start on custom port
deno task cli start --port 8080

# Start without scheduler
deno task cli start --no-scheduler
```

### `dev` - Development Mode

Start in development mode. Note: For hot reload, use `deno task dev` instead.

```bash
deno task cli dev [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | `3001` | Server port |
| `-h, --host <address>` | `localhost` | Server host |

### `db:migrate` - Run Database Migrations

Run database migrations to update schema or seed data.

```bash
deno task cli db:migrate
```

### `db:reset` - Reset Database

**Development only!** Deletes all data in the Deno KV database.

```bash
deno task cli db:reset --confirm
```

> **Warning:** This operation is **blocked in production** and requires `--confirm` to proceed.

### `health` - Health Check

Check bot health and configuration status.

```bash
deno task cli health
```

**Output example:**

```
✓ Environment: development
✓ Required Secrets: ok
✓ SLACK_BOT_TOKEN: Configured
⚠ TELEGRAM_BOT_TOKEN: Not configured
✓ Database: Connected
✓ AI Agent: Initialized
```

### `scheduler:run` - Run Scheduler Once

Run the daily scheduler once (useful for testing).

```bash
deno task cli scheduler:run
```

### `bot:webhook` - Set Up Telegram Webhook

Configure the Telegram bot webhook URL.

```bash
deno task cli bot:webhook [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-u, --url <url>` | `http://localhost:3001/api/telegram/webhook` | Webhook URL |
| `-s, --secret <secret>` | `$TELEGRAM_WEBHOOK_SECRET` | Webhook secret token |

**Examples:**

```bash
# Set webhook for local development
deno task cli bot:webhook --url "https://your-domain.com/api/telegram/webhook"

# Set webhook with custom secret
deno task cli bot:webhook --url "https://your-domain.com/api/telegram/webhook" --secret "my-secret"
```

### `bot:info` - Get Bot Information

Display bot information from Telegram and Slack APIs.

```bash
deno task cli bot:info
```

**Output example:**

```
=== Telegram Bot Info ===
ID: 123456789
Name: Work Boost Bot
Username: @work_boost_bot
Can join groups: true
Can read all group messages: false
Supports inline queries: true

=== Slack Bot Info ===
Team: My Workspace
User: Work Boost Bot
Team ID: T12345678
User ID: U12345678
```

### `chat` - Interactive Chat Mode

Chat directly with the AI brain from the command line. Useful for testing and development.

```bash
deno task cli chat [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-s, --session <id>` | `cli-chat` | Session ID for conversation history |
| `-v, --verbose` | `false` | Enable verbose output (shows response time) |

**Examples:**

```bash
# Start chat with default session
deno task cli chat

# Start with custom session ID
deno task cli chat --session my-session

# Enable verbose mode
deno task cli chat --verbose
```

**Chat Commands:**

| Command | Description |
|---------|-------------|
| `/exit`, `/quit` | Exit chat mode |
| `/clear` | Clear conversation history |
| `/sessions` | List all sessions |
| `/history` | Show conversation history |
| `/capabilities` | List available AI capabilities |
| `/session <id>` | Switch to a different session |
| `/verbose` | Toggle verbose mode |
| `/help` | Show help message |

**Environment Requirements:**

- `GOOGLE_API_KEY` is required for chat mode
- Other bot tokens (Slack/Telegram) are **not required** for chat mode

**Example Session:**

```
╭─────────────────────────────────────────────────────────╮
│  Work Boost Interactive Chat                            │
│  Type your message and press Enter to chat              │
│  Type /exit or /quit to exit                            │
│  Type /clear to clear conversation history              │
│  Type /help for available commands                      │
╰─────────────────────────────────────────────────────────╯

🧠 You: hello
🤖 AI: Hello! How can I help you today?

🧠 You: /capabilities

Available capabilities:
  - daily-work-report: Generate daily work report from completed tasks
  - parse-debt-entry: Parse debt entry from natural language

🧠 You: /exit
Goodbye! 👋
```

## Environment Variables

The CLI reads configuration from environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes | Google AI API key for agent |
| `DENO_ENV` | No | Environment (`development`, `production`, `test`) |
| `SLACK_BOT_TOKEN` | Production* | Slack bot token |
| `SLACK_SIGNING_SECRET` | Production* | Slack signing secret |
| `TELEGRAM_BOT_TOKEN` | Production* | Telegram bot token |
| `TELEGRAM_WEBHOOK_SECRET` | Production* | Telegram webhook secret |

*Required in production mode for full functionality.

## Common Workflows

### First Time Setup

```bash
# 1. Check health
deno task cli health

# 2. Run migrations
deno task cli db:migrate

# 3. Start server
deno task cli start
```

### Development Workflow

```bash
# Start with hot reload (recommended)
deno task dev

# Or use CLI
deno task cli dev
```

### Production Deployment

```bash
# 1. Set environment variables
export DENO_ENV=production
export GOOGLE_API_KEY=your_key
export SLACK_BOT_TOKEN=your_token
# ... etc

# 2. Check health
deno task cli health

# 3. Run migrations
deno task cli db:migrate

# 4. Set up webhook (if needed)
deno task cli bot:webhook --url "https://your-domain.com/api/telegram/webhook"

# 5. Start server
deno task cli start
```

### Troubleshooting

```bash
# Check configuration
deno task cli health

# Get bot info to verify tokens
deno task cli bot:info

# Test AI brain interactively
deno task cli chat

# Reset database (dev only)
deno task cli db:reset --confirm

# Test scheduler
deno task cli scheduler:run
```

## Architecture

The CLI is built with [Commander.js](https://www.npmjs.com/package/commander) and located at `src/app/cli/index.ts`.

```
src/app/cli/
└── index.ts          # Main CLI entry point
```

### Command Structure

```typescript
program
  .command('command:name')
  .description('Description')
  .option('-f, --flag', 'Option description')
  .action(async (options) => {
    // Command implementation
  });
```

### Adding New Commands

To add a new command to the CLI:

1. Open `src/app/cli/index.ts`
2. Add a new command using the `program.command()` pattern
3. Update this documentation with the new command

```typescript
program
  .command('my:command')
  .description('My new command')
  .option('--flag', 'Description')
  .action(async (options) => {
    // Your implementation
    logger.info('Running my command...');
    Deno.exit(0);
  });
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (check logs for details) |
