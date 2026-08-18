---
summary: 'Telegram bot support status, capabilities, and configuration'
read_when:
  - Working on Telegram features or webhooks
title: 'Telegram'
---

# Telegram Bot Feature

## Overview

Work Boost's Telegram bot provides daily AI-powered work summaries and includes debt tracking
capabilities. Users can subscribe to receive daily reports, log work updates, and manage personal
debts directly through Telegram.

## Setup

### Required Environment Variables

```bash
# Required for Telegram bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234567890
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Optional: Rate limiting (messages per second)
TELEGRAM_RATE_LIMIT_INTERACTIVE=3   # Default: 3
TELEGRAM_RATE_LIMIT_BULK=25         # Default: 25
```

### Getting a Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token (e.g., `123456:ABC-DEF1234567890`)
4. Set `TELEGRAM_BOT_TOKEN` environment variable

### Setting Up Webhooks

For production deployment, set up a webhook:

```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/telegram",
    "secret_token": "your-webhook-secret"
  }'
```

The webhook secret is validated via the `x-telegram-bot-api-secret-token` header.

---

## Features

### Core Commands

| Command        | Description                         |
| -------------- | ----------------------------------- |
| `/start`       | Show welcome message and main menu  |
| `/subscribe`   | Subscribe to daily work summaries   |
| `/unsubscribe` | Unsubscribe from daily summaries    |
| `/status`      | Check subscription status           |
| `/help`        | Show help message with all commands |

### Debt Tracking Commands

| Command        | Alias       | Description                       |
| -------------- | ----------- | --------------------------------- |
| `/debt`        | `/d`        | Record a new debt                 |
| `/debts`       | `/dlist`    | List your debts with filters      |
| `/settle`      | -           | Mark a debt as paid               |
| `/delete`      | -           | Delete a debt record              |
| `/debtsummary` | `/dsummary` | Show debt summary statistics      |
| `/remind`      | -           | Configure debt reminder frequency |

### Interactive Features

- **Inline Keyboards**: All actions available via button presses
- **Multi-language Support**: Vietnamese and English (partial)
- **HTML Formatting**: Rich messages with bold, italics, emojis
- **Message Splitting**: Long messages automatically split at 4096 chars (Telegram limit)

---

## Architecture

### File Structure

```
packages/services/src/telegram/
├── telegram.ts              # Main service class
├── keyboards.ts             # Inline keyboard definitions
├── sanitizer.ts             # Input sanitization middleware
└── handlers/
    ├── index.ts             # Handler exports
    ├── start.ts             # /start command
    ├── subscribe.ts         # /subscribe command
    ├── unsubscribe.ts       # /unsubscribe command
    ├── status.ts            # /status command
    ├── help.ts              # /help command
    ├── message.ts           # Generic text messages
    └── debt/
        ├── index.ts         # Debt handler exports
        ├── debt.ts          # Core debt logic
        ├── list.ts          # List debts with filters
        ├── settle.ts        # Mark debts as paid
        ├── delete.ts        # Delete debt records
        ├── summary.ts       # Debt statistics
        ├── remind.ts        # Reminder settings
        └── callbacks.ts     # Button callbacks

packages/services/src/
└── debt-telegram-formatter.ts  # Debt message formatting
```

### Class: TelegramService

```typescript
class TelegramService implements BotService {
  constructor(db: Database, agent: Agent);

  // Send messages
  async sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;
  async sendBulkMessage(chatId: string, content: string): Promise<void>;

  // Webhook handling
  async validateWebhook(request: Request): Promise<boolean>;
  async handleWebhook(request: Request): Promise<Response>;

  // Lifecycle
  async start(): Promise<void>; // Long polling mode (dev)
  async stop(): Promise<void>;
}
```

---

## Middleware & Security

### Rate Limiting

Two-tier rate limiting prevents API spam:

1. **Interactive**: 3 messages/2 seconds per user (for commands)
2. **Bulk**: 25 messages/second (for daily summaries)

### Input Sanitization

All user input is sanitized via `createSanitizationMiddleware()`:

- Removes control characters
- Limits message length
- Prevents injection attacks

### Timing-Safe Comparison

Webhook secrets use timing-safe string comparison to prevent timing attacks:

```typescript
function timingSafeEqual(a: string, b: string): boolean;
```

---

## Debt Tracking

### Data Model

```typescript
interface Debt {
  id: string; // UUID
  userId: string; // Telegram user ID
  direction: 'lent' | 'borrowed';
  personName: string; // Name of the other party
  amount: number; // Decimal amount
  currency: string; // ISO currency code (USD, VND, etc.)
  reason?: string; // Optional reason
  status: 'pending' | 'paid' | 'cancelled';
  debtDate?: Date; // When debt occurred
  createdAt: Date;
  paidAt?: Date;
}
```

### User Flow

1. **Record Debt**: `/debt` → Select direction → Enter person → Enter amount → Add reason
2. **View Debts**: `/debts` → Select filter (All/Pending/Paid/Lent/Borrowed)
3. **Settle**: Select debt → Click "Mark Paid"
4. **Delete**: Select debt → Click "Delete" → Confirm

### Pending State

During debt entry, user state is tracked in-memory:

```typescript
const pendingDebts = new Map<string, PendingDebtState>();

interface PendingDebtState {
  step: 'direction' | 'person' | 'amount' | 'reason';
  direction?: 'lent' | 'borrowed';
  personName?: string;
  amount?: number;
  reason?: string;
}
```

---

## Message Formatting

### HTML Escape

Special characters are escaped before sending:

```typescript
escapeHtml(text: string): string
// & → &amp;
// < → &lt;
// > → &gt;
```

### Currency Formatting

Supported currencies with symbols:

- USD (`$`), EUR (`€`), GBP (`£`), JPY (`¥`), VND (`₫`)

### Message Splitting

Long messages are split at 4096 characters (Telegram's limit):

```typescript
formatDebtList(debts: Debt[]): string[]
// Returns array of messages, each under 4096 chars
```

---

## Error Handling

### Grammy Error Handling

```typescript
bot.catch((err) => {
  const { ctx, error } = err;

  // Log redacted error
  console.error(redactSensitiveData({ ... }));

  // Handle specific errors
  if (error.error_code === 403) {
    // User blocked bot - disable platform
    db.disablePlatform(userId, 'telegram');
  }
});
```

### Auto-Retry

Automatic retry for rate limits and server errors:

```typescript
bot.api.config.use(autoRetry({
  maxRetryAttempts: 3,
  maxDelaySeconds: 60,
}));
```

---

## Development

### Running Locally (Long Polling)

```bash
deno task dev
```

### Testing Webhooks

Use ngrok or similar for local webhook testing:

```bash
ngrok http 3001
```

Then set the webhook with ngrok URL.

---

## Keyboard Layouts

### Main Menu

```
[Subscribe] [Status]
[  💵 Debts  ]
[  Help  ] [Unsubscribe]
```

### Debt Menu

```
[📝 Record Debt] [📋 My Debts]
[  📊 Summary  ] [⏰ Reminders ]
[      « Back               ]
```

### Debt List Filters

```
[All] [Pending] [Paid]
[Lent] [Borrowed]
[      « Back        ]
```

### Debt Item

```
[  ✅ Mark Paid  ]
[  🗑 Delete     ]
[      « Back    ]
```
