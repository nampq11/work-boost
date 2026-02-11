---
title: "Telegram Bot Integration with grammY Framework for Work Boost"
category: integration-issues
component: telegram-bot-integration
severity: medium
tags: telegram-bot, grammy, deno, multi-platform, ai-integration, webhook, rate-limiting, message-formatters
created: 2026-02-11
related_prs: "13"
related_issues: null
time_to_solve: ~4 hours (implementation + code review)
complexity: medium
---

# Telegram Bot Integration with grammY Framework for Work Boost

## Problem Summary

The Work Boost project required extending its Slack bot functionality to support Telegram as a second platform. This involved integrating the grammY framework with Deno, implementing webhook-based communication with proper authentication, and creating platform-specific message formatters while maintaining shared business logic between platforms. A local code review identified 14 issues across critical (P1), important (P2), and code quality (P3) priorities that need to be addressed before the integration is production-ready.

## Root Cause: What Made This Integration Challenging

### Primary Challenges

1. **grammY Package Naming Convention**: The main grammY library uses `grammy` but its plugins use the `@grammyjs/*` namespace pattern, not `grammy-*`. This caused confusion when trying to install auto-retry and rate limiter plugins.

2. **Deno 2 + npm Package Compatibility**: While Deno 2 supports npm packages natively with `nodeModulesDir: "auto"`, there were specific requirements around:
   - Correct import syntax for npm packages in deno.json
   - Package resolution differences between Node.js and Deno
   - Webhook handler compatibility with Deno's native HTTP server

3. **Platform-Specific Message Formatting**: Telegram has distinct requirements compared to Slack:
   - HTML parse mode requires escaping `<`, `>`, and `&` characters
   - 4096 character message limit requiring splitting logic
   - Different keyboard/button structure (InlineKeyboard vs Slack blocks)

4. **Webhook Authentication**: Telegram uses a custom header (`X-Telegram-Bot-Api-Secret-Token`) instead of signature verification like Slack.

## Working Solution

### Step 1: Add grammY Dependencies to deno.json

```json
{
  "imports": {
    "grammy": "npm:grammy@^1.21.1",
    "@grammyjs/auto-retry": "npm:@grammyjs/auto-retry@^2.0.0",
    "@grammyjs/ratelimiter": "npm:@grammyjs/ratelimiter@^1.2.1"
  },
  "nodeModulesDir": "auto"
}
```

**Key Point**: Use `@grammyjs/*` for plugins, not `grammy-auto-retry` or similar variations.

### Step 2: Create Platform Abstraction Interface

**File**: `src/core/bot/bot-service.ts`

```typescript
export type Platform = 'slack' | 'telegram';

export interface BotService {
  readonly platform: Platform;
  sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;
  validateWebhook(request: Request): Promise<boolean>;
  parseUpdate(request: Request): Promise<BotUpdate>;
  handleWebhook(request: Request): Promise<Response>;
}

export interface SendOptions {
  parseMode?: 'HTML' | 'Markdown' | 'None';
}
```

### Step 3: Implement TelegramService

**File**: `src/services/telegram/telegram.ts`

```typescript
import { autoRetry } from '@grammyjs/auto-retry';
import { limit } from '@grammyjs/ratelimiter';
import { Bot, GrammyError } from 'grammy';

export class TelegramService implements BotService {
  readonly platform: Platform = 'telegram';
  private bot: Bot;

  constructor(db: Database, agent: Agent) {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new Bot(token);
    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));
    this.bot.use(limit({ timeFrame: 2000, limit: 3 }));
  }

  async validateWebhook(request: Request): Promise<boolean> {
    const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
    if (webhookSecret) {
      const receivedToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      return receivedToken === webhookSecret;
    }
    return true;
  }

  async handleWebhook(request: Request): Promise<Response> {
    const handleUpdate = webhookCallback(this.bot, 'std/http');
    return handleUpdate(request);
  }
}
```

### Step 4: Create Telegram Message Formatter

**File**: `src/services/formatting/telegram-formatter.ts`

```typescript
export class TelegramFormatter {
  format(response: AgentResponse): string[] {
    const content = this.buildContent(response);
    return this.splitMessage(content, 4096);
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const messages: string[] = [];
    while (text.length > maxLength) {
      const splitAt = text.lastIndexOf('\n', maxLength);
      messages.push(text.slice(0, splitAt > 0 ? splitAt : maxLength));
      text = text.slice(splitAt > 0 ? splitAt : maxLength).trim();
    }
    if (text) messages.push(text);
    return messages;
  }
}
```

### Step 5: Wire Up Webhook in Main Entry Point

**File**: `src/main.ts`

```typescript
export async function bootstrap() {
  const db = await Database.init();
  const agent = await Agent.init(Deno.env.get('GOOGLE_API_KEY') || '');
  const telegram = new TelegramService(db, agent);

  Deno.serve({ port: 2002 }, async (req: Request) => {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/telegram')) {
      if (!(await telegram.validateWebhook(req))) {
        return new Response('Unauthorized', { status: 401 });
      }
      return await telegram.handleWebhook(req);
    }

    return new Response('Hello, world', { status: 200 });
  });
}
```

## Gotchas and Tricky Parts

### grammY Package Naming

**Issue**: Plugins are scoped under `@grammyjs/*`, not `grammy-*`.

**Incorrect**:
```json
"grammy-auto-retry": "npm:grammy-auto-retry"
```

**Correct**:
```json
"@grammyjs/auto-retry": "npm:@grammyjs/auto-retry@^2.0.0"
```

### Deno 2 Compatibility with grammY

**Issue**: grammY's `webhookCallback` returns a function compatible with Node's `http` module.

**Solution**: Use `'std/http'` mode:
```typescript
const handleUpdate = webhookCallback(this.bot, 'std/http');
return handleUpdate(request);
```

### Message Length Limits

**Issue**: Telegram messages are limited to 4096 characters.

**Solution**: Implement intelligent splitting that breaks at newlines when possible.

### HTML Escaping Requirements

**Issue**: When using `parse_mode: 'HTML'`, characters like `<`, `>`, `&` must be escaped.

**Solution**:
```typescript
private escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

### User Blocking Detection

**Issue**: When a user blocks the bot, messages fail silently.

**Solution**: Catch error code 403 in the error handler and disable the platform for that user.

## Key Decisions Made

### Platform Abstraction Approach

**Decision**: Created a `BotService` interface that both Slack and Telegram implement.

**Rationale**:
- Allows the scheduler to work with any platform uniformly
- Makes adding new platforms (Discord, etc.) straightforward
- Centralizes common operations

**Trade-off**: Some platform-specific features may be harder to access through the abstraction.

### Webhook Authentication Strategy

**Decision**: Use Telegram's `X-Telegram-Bot-Api-Secret-Token` header for webhook validation.

**Rationale**: Simpler than signature verification, configurable via Telegram's `setWebhook` API call.

### Rate Limiting Configuration

**Decision**: Use `@grammyjs/ratelimiter` with 3 messages per 2 seconds per user.

**Rationale**: Prevents spam/abuse, respects Telegram's API rate limits, provides user-friendly feedback.

### Message Formatting per Platform

**Decision**: Separate formatter classes for each platform.

- **TelegramFormatter**: HTML parse mode, escapes special characters, splits at 4096 chars
- **SlackFormatter**: Plain text with task lists

## Related Documentation

### Internal Documents

| File Path | Description |
|-----------|-------------|
| `docs/brainstorms/2026-02-11-telegram-bot-brainstorm.md` | Brainstorm document outlining unified BotService architecture |
| `docs/plans/2026-02-11-feat-telegram-bot-integration-plan.md` | Comprehensive implementation plan with 6 phases |
| `CLAUDE.md` | Project guide with tech stack and code style guidelines |
| `README.md` | Project overview with Telegram setup instructions |

### Code References

- `src/services/slack/slack.ts` - Reference pattern for webhook-based messaging
- `src/services/database/database.ts` - Deno KV patterns and key structures
- `src/entity/subscription.ts` - Multi-platform subscription data model

### External Documentation

- [grammY Framework Docs](https://grammy.dev/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Webhooks Guide](https://core.telegram.org/bots/webhooks)

## Prevention Strategies

### Security (Critical Implementation Required)

1. **Fail-closed webhook authentication**: The implementation MUST reject requests when `TELEGRAM_WEBHOOK_SECRET` is not configured in production:

```typescript
async validateWebhook(request: Request): Promise<boolean> {
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');

  // Fail closed in production
  if (Deno.env.get('DENO_ENV') === 'production' && !webhookSecret) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET required in production');
  }

  if (webhookSecret) {
    const receivedToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');

    // Use timing-safe comparison
    if (!receivedToken || receivedToken.length !== webhookSecret.length) {
      return false;
    }

    return crypto.subtle.timingSafeEqual(
      new TextEncoder().encode(receivedToken),
      new TextEncoder().encode(webhookSecret)
    ) as boolean;
  }

  return true;
}
```

2. **IP whitelist enforcement**: Verify requests come from Telegram's IP ranges in production:

```typescript
const TELEGRAM_IP_RANGES = ['149.154.160.0/20', '91.108.4.0/22'];

function isTelegramIP(ip: string): boolean {
  // Implement CIDR matching or use a library
  return isInCIDRRange(ip, TELEGRAM_IP_RANGES);
}
```

3. **Input validation with Zod schemas**: Validate all user input before processing:

```typescript
import { z } from 'zod';

const UserMessageSchema = z.object({
  text: z.string().min(1).max(10000),
  userId: z.string().regex(/^\d+$/),
  chatId: z.string().regex(/^\d+$/),
});

// In handler
const result = UserMessageSchema.safeParse({
  text: ctx.message?.text,
  userId: ctx.from?.id.toString(),
  chatId: ctx.chat?.id.toString(),
});

if (!result.success) {
  await ctx.reply('Invalid message format');
  return;
}
```

4. **Secure logging with redaction**:

```typescript
const SENSITIVE_KEYS = ['token', 'password', 'secret', 'apiKey', 'botToken'];

function redactSensitiveData(obj: unknown): unknown {
  // Recursive redaction of sensitive fields
  const redacted = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    const shouldRedact = SENSITIVE_KEYS.some(sensitive =>
      key.toLowerCase().includes(sensitive.toLowerCase())
    );
    redacted[key] = shouldRedact ? '[REDACTED]' :
      (typeof value === 'object' ? redactSensitiveData(value) : value);
  }
  return redacted;
}

// Usage
console.error('Telegram bot error:', redactSensitiveData({ error, userId, chatId }));
```

5. **Request size limits**: Prevent DoS with large payloads:

```typescript
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB

async function validateRequestSize(request: Request): Promise<boolean> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
    return false;
  }
  return true;
}
```

### Performance

1. **Secondary indexes**: Implement indexed lookups for common queries (subscriptions by user, messages by user)
2. **Concurrent batching**: Process subscriptions in parallel batches with controlled concurrency
3. **Caching**: Add query result caching with TTL for frequently accessed data

### Architecture

1. **Migration scripts**: Version data schema and create migration scripts with forward/rollback support
2. **Platform-prefixed IDs**: Use `slack:12345`, `telegram:67890` format to avoid ID collisions
3. **User linking**: Implement explicit consent-based user identity linking across platforms

### Code Quality

1. **YAGNI principle**: Don't create interfaces "just in case" - extract abstractions only when 2+ implementations exist
2. **DRY principle**: Consolidate duplicate handlers (command + callback variants)

### Performance

1. **Secondary indexes**: Implement indexed lookups for common queries (subscriptions by user, messages by user)
2. **Concurrent batching**: Process subscriptions in parallel batches with controlled concurrency
3. **Caching**: Add query result caching with TTL for frequently accessed data

### Architecture

1. **Migration scripts**: Version data schema and create migration scripts with forward/rollback support
2. **Platform-prefixed IDs**: Use `slack:12345`, `telegram:67890` format to avoid ID collisions
3. **User linking**: Implement explicit consent-based user identity linking across platforms

### Code Quality

1. **YAGNI principle**: Don't create interfaces "just in case" - extract abstractions only when 2+ implementations exist
2. **DRY principle**: Consolidate duplicate handlers (command + callback variants)

## Checklist for Future Platform Additions

### Pre-Integration

- [ ] Webhook secret configuration required in production
- [ ] Input sanitization middleware applied
- [ ] Platform-prefixed user IDs implemented
- [ ] Entity migration plan documented
- [ ] Handler files organized by command/feature
- [ ] Formatter class for platform-specific output

### Testing

- [ ] Webhook authentication tests (with and without secret token)
- [ ] Input validation tests (malformed payloads, oversized messages)
- [ ] Rate limiting tests (exceed limits, verify reset)
- [ ] Message formatter tests (HTML escaping, message splitting)
- [ ] Integration tests for happy path
- [ ] Error handling tests (403 blocked user, network failures)

**Test Example**:
```typescript
Deno.test('Telegram webhook: rejects requests without secret', async () => {
  Deno.env.set('TELEGRAM_WEBHOOK_SECRET', 'test-secret');
  const service = new TelegramService(db, agent);

  const request = new Request('https://example.com/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Missing X-Telegram-Bot-Api-Secret-Token
  });

  const isValid = await service.validateWebhook(request);
  assertEquals(isValid, false);
});

Deno.test('Telegram formatter escapes HTML entities', () => {
  const formatter = new TelegramFormatter();
  const input = '<b>Bold</b> & "quotes"';
  const result = formatter.escapeHtml(input);
  assertEquals(result, '&lt;b&gt;Bold&lt;/b&gt; &amp; &quot;quotes&quot;');
});
```

### Documentation

- [ ] Platform setup guide
- [ ] Environment variables documented
- [ ] Rate limits documented
- [ ] Troubleshooting guide

## Environment Variables Required

```bash
# Required
GOOGLE_API_KEY=your_google_api_key

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234567890
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Daily Summary Schedule (optional)
DAILY_SUMMARY_SCHEDULE="0 9 * * *"  # 9:00 AM daily
# Or:
DAILY_SUMMARY_HOUR=9
DAILY_SUMMARY_MINUTE=0
```

## Setting Up Telegram Bot

1. **Create a Telegram Bot**:
   - Open Telegram and search for [@BotFather](https://t.me/BotFather)
   - Send `/newbot` and follow the instructions
   - Copy the bot token (format: `123456:ABC-DEF1234567890`)

2. **Set Webhook** (production):
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-domain.com/telegram", "secret_token": "your-secret"}'
   ```

## Local Development

For local testing, use polling mode instead of webhooks:

```typescript
// In development, use long polling instead of webhooks
if (Deno.env.get('DENO_ENV') !== 'production') {
  await bot.start();
  console.log('Bot started with polling mode');
} else {
  // Production webhook mode
  Deno.serve({ port: 2002 }, async (req: Request) => {
    // ... webhook handling
  });
}
```

Or use ngrok to tunnel webhooks locally:

```bash
# Install ngrok
# Start your dev server
deno task dev

# In another terminal, start ngrok
ngrok http 2002

# Use the ngrok URL to set webhook
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://xxxx-xx-xx-xx-xx.ngrok.io/telegram", "secret_token": "dev-secret"}'
```

## Deno Permissions Required

When running directly with Deno, these permissions are required:

```bash
deno run --allow-net --allow-read --allow-write --allow-env --unstable-kv --unstable-cron src/main.ts
```

| Flag | Purpose |
|------|---------|
| `--allow-net` | Network requests for Telegram API and webhooks |
| `--allow-read` | File access for configuration |
| `--allow-write` | Deno KV storage |
| `--allow-env` | Environment variables |
| `--unstable-kv` | Deno KV database |
| `--unstable-cron` | Scheduled daily summaries |
