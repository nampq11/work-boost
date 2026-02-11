# Work Boost - Project Guide

## Overview

Work Boost is a productivity bot for managing and tracking daily work tasks with AI-powered daily summaries. Supports both Slack and Telegram platforms. Built with Deno + TypeScript.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Deno with `nodeModulesDir: "auto"` |
| Language | TypeScript |
| Database | Deno KV |
| AI | Google Generative AI |
| Bot Framework | grammY (Telegram), native (Slack) |
| API Framework | Express.js |
| Formatter | Biome |
| Linter | Oxlint |

## Development

### Start Development Server

```bash
deno task dev
```

### Run Tests

```bash
deno test
```

## Code Quality

### Linting (Oxlint)

```bash
# Check for issues
deno task lint

# Auto-fix issues
deno task lint:fix
```

### Formatting (Biome)

```bash
# Format all files
deno task format

# Check formatting (no changes)
deno task format:check
```

### All Checks

```bash
# Format, lint, and organize imports (write changes)
deno task check

# CI mode (no changes, fails if issues found)
deno task check:ci
```

## Configuration

| File | Purpose |
|------|---------|
| `biome.json` | Single quotes, 2 spaces, 100 char line width |
| `.oxlintrc.json` | TypeScript rules enabled, Deno environment |

## Environment Variables

```bash
# Required
GOOGLE_API_KEY=your_google_api_key

# Slack (optional)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=your-channel-id
SLACK_SIGNING_SECRET=your-signing-secret

# Telegram (optional)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234567890
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Daily Schedule (optional)
DAILY_SUMMARY_SCHEDULE="0 9 * * *"  # 9:00 AM daily
```

## Project Structure

```
src/
├── main.ts              # Entry point (webhook server)
├── core/
│   ├── bot/             # Bot service interface
│   │   └── bot-service.ts
│   ├── env.ts           # Environment variables
│   ├── logger/          # Winston logger
│   └── session/         # Session management
├── entity/              # Data models
│   ├── task.ts          # Task entity
│   ├── user.ts          # User entity
│   ├── agent.ts         # Agent entity
│   └── subscription.ts  # Subscription entity
├── services/
│   ├── slack/           # Slack integration
│   ├── telegram/        # Telegram integration
│   │   ├── handlers/    # Command handlers
│   │   ├── keyboards.ts # Inline keyboards
│   │   └── telegram.ts  # Main bot class
│   ├── formatting/      # Platform-specific formatters
│   ├── scheduler/       # Daily job scheduler
│   ├── agent/           # AI agent service
│   └── database/        # Deno KV storage
└── app/                 # Express API server
```

## Bot Architecture

The project uses a unified `BotService` interface that both Slack and Telegram implement:

```typescript
interface BotService {
  readonly platform: 'slack' | 'telegram';
  sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;
  validateWebhook(request: Request): Promise<boolean>;
  parseUpdate(request: Request): Promise<BotUpdate>;
  handleWebhook(request: Request): Promise<Response>;
}
```

### Message Formatting

Each platform has its own formatter:
- `SlackFormatter` - Formats messages as plain text with task lists
- `TelegramFormatter` - Formats messages as HTML with escaping and 4096 char splitting

### Subscription Model

Users can subscribe to one or both platforms:

```typescript
interface Subscription {
  userId: string;
  platforms: {
    slack?: string;      // Slack user/channel ID
    telegram?: string;   // Telegram chat ID
  };
  enabled: Platform[];   // Currently active platforms
  subscribedAt: Date;
  lastSentAt?: Date;
}
```

## Coding Guidelines

### Naming Conventions

- Use **Work Boost** for product/docs headings
- Use `work-boost` for CLI, package names, and config keys
- Files: `kebab-case.ts` for services/utilities, `PascalCase.ts` for classes/entities

### File Organization

- Keep files under ~300 LOC; split when it improves clarity
- Extract helpers instead of creating "V2" copies
- Colocate tests with source: `*.test.ts` next to source file

### TypeScript

- Prefer strict typing
- Use Zod for request/response validation
- Add brief comments for tricky or non-obvious logic
- Use existing dependency injection patterns

### Bot Commands

**Telegram Commands:**
- `/start` - Show welcome and main menu
- `/subscribe` - Subscribe to daily summaries
- `/unsubscribe` - Unsubscribe (current platform only)
- `/status` - Check subscription status
- `/help` - Display help

**Unsubscribe Behavior:** When user clicks unsubscribe on Telegram, only Telegram is disabled (Slack remains active if subscribed).

## Testing

### Running Tests

```bash
deno test
```

### Test Organization

- Place tests next to source files
- Name test files: `filename.test.ts`
- Use `deno test` for running tests

## Troubleshooting

### Deno KV Issues

```bash
# Clear KV data (development only)
rm -rf ~/.deno/deno_kv_*
```

### Bot Not Responding

1. Verify bot token is correct
2. Check bot has required scopes/permissions
3. Verify ngrok/tunnel URL if testing locally
4. Check logs: `deno task dev`

### Permission Errors

Ensure Deno has required permissions:
- `--allow-net` for network requests
- `--allow-read` for file access
- `--allow-write` for KV storage
- `--allow-env` for environment variables
- `--unstable-kv` for Deno KV
- `--unstable-cron` for cron jobs
