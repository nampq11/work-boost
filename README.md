# Work Boost

Work Boost is a personal AI assistant for boosting your work and life. It answers directly in your Slack and Telegram channels, helping you stay productive with intelligent conversations and task management.

![Work Boost](./assets/work-boost.png)

## Features

- **Multi-Platform Support**: Works with both Slack and Telegram
- **AI-Powered Conversations**: Chat with an AI assistant that helps with work and life tasks
- **Debt Tracking**: Track personal debts and loans with `/debt` commands
  - `/debt` - Add a new debt record
  - `/debt_list` - List all your debts
  - `/debt_settle` - Mark a debt as settled
  - `/debt_delete` - Delete a debt record
  - `/debt_summary` - Get a summary of your debts
- **Task Management**: Easily add, update, and delete tasks
- **Daily AI Reports**: Get AI-powered summaries of your daily work
- **Subscription Management**: Subscribe/unsubscribe to daily summaries
- **Flexible Scheduling**: Configure when to receive daily summaries and reminders

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/nampq11/work-boost.git
    ```
2. Navigate to the project directory:
    ```sh
    cd work-boost
    ```

## Configuration

Create a `.env` file in the project root:

```bash
# Required - Google AI for chat and summaries
GOOGLE_API_KEY=your_google_api_key

# Environment
DENO_ENV=development    # development | production | test
LOG_LEVEL=info          # error | warn | info | debug

# Server (optional)
PORT=3001               # Server port (default: 3001)
HOST=localhost          # Server host
WORKBOOST_API_PREFIX=/api  # API prefix

# Slack (optional - for Slack integration)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=your-channel-id
SLACK_SIGNING_SECRET=your-signing-secret

# Telegram (optional - for Telegram integration)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234567890
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Daily Summary Schedule (optional)
DAILY_SUMMARY_SCHEDULE="0 9 * * *"  # 9:00 AM daily
```

## Setting Up Telegram Bot

1. **Create a Telegram Bot:**
   - Open Telegram and search for [@BotFather](https://t.me/BotFather)
   - Send `/newbot` and follow the instructions
   - Copy the bot token (format: `123456:ABC-DEF1234567890`)

2. **Set Webhook (optional for production):**
   ```sh
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-domain.com/api/telegram/webhook", "secret_token": "your-secret"}'
   ```

3. **Add to `.env`:**
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234567890
   TELEGRAM_WEBHOOK_SECRET=your-secret
   ```

## Usage

### Development Server

```sh
deno task dev
```

The server will start on http://localhost:3001/api

### Using the Telegram Bot

1. Start a chat with your bot on Telegram
2. Send `/start` to see the main menu
3. Use available commands:

**General Commands:**
- `/start` - Show the main menu and get started
- `/subscribe` - Subscribe to daily AI summaries
- `/unsubscribe` - Unsubscribe from summaries
- `/status` - Check your subscription status
- `/help` - Show help message

**Debt Tracking Commands:**
- `/debt` - Add a new debt/loan record (e.g., `/debt John $50`)
- `/debt_list` - List all your debts
- `/debt_settle` - Mark a debt as settled
- `/debt_delete` - Delete a debt record
- `/debt_summary` - Get a summary of your debts

**AI Chat:**
- Simply send any message to chat with the AI assistant

### Daily Summary Schedule

Configure when to receive daily summaries via environment variables:

```bash
# Full cron format
DAILY_SUMMARY_SCHEDULE="0 9 * * *"  # 9:00 AM daily

# Or use hour/minute
DAILY_SUMMARY_HOUR=9
DAILY_SUMMARY_MINUTE=0
```

## Development

### Code Quality

```sh
# Format code
deno task format:fix

# Format check
deno task format

# Lint with auto-fix
deno task lint:fix

# Lint check
deno task lint

# Run all checks (CI)
deno task check
```

### Testing

```sh
deno test
```

### Running Locally

```sh
# Development server with hot reload
deno task dev

# Production API server
deno task start
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
