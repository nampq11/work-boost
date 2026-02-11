# Work Boost

Work Boost is a productivity tool designed to help you manage and track your daily work tasks efficiently with AI-powered daily summaries.

![Work Boost](./assets/work-boost.png)

## Features

- **Multi-Platform Support**: Works with both Slack and Telegram
- **Daily AI Reports**: Get AI-powered summaries of your daily work
- **Task Management**: Easily add, update, and delete tasks
- **Integration with Google Generative AI**: Leverage AI to enhance your productivity
- **Flexible Scheduling**: Configure when to receive your daily summaries

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
# Required
GOOGLE_API_KEY=your_google_api_key

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
     -d '{"url": "https://your-domain.com/telegram", "secret_token": "your-secret"}'
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

The server will start on port 2002.

### Using the Telegram Bot

1. Start a chat with your bot on Telegram
2. Send `/start` to see the main menu
3. Use buttons or commands:
   - `/subscribe` - Subscribe to daily summaries
   - `/unsubscribe` - Unsubscribe from summaries
   - `/status` - Check your subscription status
   - `/help` - Show help message

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
deno task format

# Check linting
deno task lint

# Run all checks
deno task check:ci
```

### Testing

```sh
deno test
```

## Architecture

```
src/
├── main.ts                    # Entry point (webhook server)
├── core/
│   └── bot/                   # Bot service interface
├── services/
│   ├── slack/                 # Slack integration
│   ├── telegram/              # Telegram integration
│   │   ├── handlers/          # Command handlers
│   │   └── keyboards.ts       # Inline keyboards
│   ├── formatting/            # Platform-specific formatters
│   ├── scheduler/             # Daily job scheduler
│   ├── agent/                 # AI integration
│   └── database/              # Deno KV storage
└── entity/                    # Data models
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
