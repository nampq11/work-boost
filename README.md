# Work Boost

Work Boost is a local-first personal AI workspace for your daily work. It answers directly in your Slack and Telegram channels, keeps your notes and debts in a plain Markdown workspace, and sends you AI-powered daily reports.

People use it for a variety of use cases:

* Capture daily work notes and get AI-generated daily summaries
* Track personal debts and loans between friends or colleagues
* Chat with an AI assistant that can read and act on your workspace
* Run it as a native desktop app, in the browser, or purely from Slack/Telegram

![Work Boost Desktop App](./assets/desktop-app.png)

## Principles

- 📑 **Markdown-first** - Your notes, daily logs, and debt records are plain Markdown files on disk. The workspace is the durable source of truth, portable to any editor, with no export step.
- 🏠 **Local-first** - The API runs on your machine and binds to loopback. Your data stays with you; there is no Work Boost cloud and no account required.
- 🤖 **AI-first, provider-agnostic** - Chat, daily reports, and the browser Copilot all run through a configurable provider: Z.ai, OpenAI Codex, OpenRouter, or Google Gemini. Credentials live in a local pi credential file, not in the app.
- 💬 **Meet you where you are** - The same workspace is reachable from the desktop app, the browser, Slack, and Telegram.
- 🧩 **Extensible** - Extensions add webhooks and scheduled jobs; workspace HTML apps (like the built-in debt tracker) run inside the shell.
- 🔬 **Open source** - Work Boost is free and open source, built for personal use and shared with others.

## Features

- **Multi-Platform Support**: Works with both Slack and Telegram
- **AI-Powered Conversations**: Chat with an AI assistant that helps with work and life tasks
- **Debt Tracking**: Manage debts conversationally in chat or through the Copilot
  - Say things like "lent Hoa 200k for lunch", "what does Hoa owe me?", or
    "mark the lunch debt as paid"
  - `/debt <description>` is a shortcut that forwards your text to the assistant
- **Task Management**: Easily add, update, and delete tasks
- **Daily AI Reports**: Get AI-powered summaries of your daily work
- **Subscription Management**: Subscribe/unsubscribe to daily summaries
- **Flexible Scheduling**: Configure when to receive daily summaries and reminders

## How it works

```text
Browser workspace ──────┐
Desktop shell (Tauri 2) ┤
Slack / Telegram ───────┼── API composition ── Data layer ── Markdown workspace
                        │          │
                        │          ├── Brain ── Workspace tools
                        │          └── Extensions ── webhooks and scheduled jobs
                        └── HTTP and SSE
```

The Deno API is the composition root: the browser workspace, the AI Brain, and the Slack/Telegram
integrations all reach your Markdown workspace through it. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Installation

### Desktop app (recommended)

Install the native desktop app with a single command (Linux and macOS):

```sh
curl -fsSL https://raw.githubusercontent.com/nampq11/work-boost/main/scripts/install.sh | sh
```

The script downloads the latest release from GitHub Releases, verifies its SHA256 checksum, and installs it natively:

- **Linux** - `.deb` package installed via `dpkg` (non-debian systems fall back to placing the bundle in `~/Applications`)
- **macOS** - `.dmg` mounted and the app copied to `/Applications`

Windows users should download the `.msi` from the [releases page](https://github.com/nampq11/work-boost/releases/latest) and run it directly. The macOS bundle is currently unsigned; if macOS blocks the first launch, right-click the app and choose Open.

#### Updating

On launch the desktop app checks for a newer release and, when one exists, shows an `Update now`
banner that runs the same installer elevated and relaunches the app. Where an in-app install is not
available (Windows, or a Linux system without `pkexec`), open the [releases page](https://github.com/nampq11/work-boost/releases/latest) and install manually.

### Run from source

Requires [Deno](https://deno.com) 2.x:

```sh
git clone https://github.com/nampq11/work-boost.git
cd work-boost
deno task start   # production server on http://localhost:3001
deno task dev     # development server with hot reload
```

On first run, copy `.env.example` to `.env` and adjust provider keys as needed - see [Configuration](#configuration).

## Desktop App

Work Boost ships as a native desktop app (Tauri 2) that wraps the web frontend and bundles the
API as a sidecar.

Run it in development:

```sh
# Terminal 1: start the API on port 3001
deno task dev

# Terminal 2: open the desktop shell in a native window
cd apps/desktop && npm run dev
```

Build a production installer:

```sh
cd apps/desktop && npm run build
```

See [apps/desktop/README.md](./apps/desktop/README.md) for prerequisites and details.

## Configuration

Create a `.env` file in the project root:

```bash
# AI provider (optional; changes require an API restart)
AI_PROVIDER=zai              # zai | openai-codex | openrouter | google
AI_MODEL=                    # Provider default, except OpenRouter which requires one
PI_AUTH_PATH=                # Defaults to ~/.workboost/agent/auth.json (legacy ~/.pi/agent/auth.json is migrated once)

# Provider API keys are fallbacks when the selected provider has no pi credential
ZAI_API_KEY=your_zai_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
GEMINI_API_KEY=your_gemini_api_key
# GOOGLE_API_KEY is supported as a legacy Gemini fallback
GOOGLE_API_KEY=your_google_api_key

# Environment
DENO_ENV=development    # development | production | test
LOG_LEVEL=info          # error | warn | info | debug

# Server (optional)
WORKBOOST_PORT=3001     # Server port (default: 3001)
WORKBOOST_HOST=localhost  # Server host
WORKBOOST_API_PREFIX=/api  # API prefix
WORKBOOST_RATE_LIMIT_MAX=100            # Requests per window (default: 100)
WORKBOOST_RATE_LIMIT_WINDOW_MS=900000   # Window length in ms (default: 15 minutes)

# Slack (optional - for Slack integration)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=your-channel-id
SLACK_SIGNING_SECRET=your-signing-secret

# Telegram (optional - for Telegram integration)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234567890
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Daily Summary Schedule (optional - default: 6:00 PM daily)
DAILY_SUMMARY_SCHEDULE="0 18 * * *"
```

The same AI settings can be stored in `.workboost/config.json`:

```json
{
  "ai": {
    "provider": "zai",
    "model": "glm-5.2"
  }
}
```

Supported provider defaults are Z.ai (`glm-5.2`), OpenAI Codex (`gpt-5.4-mini`), and Google
Gemini (`gemini-2.5-flash`). OpenRouter requires an explicit model. Unconfigured workspaces default
to OpenAI Codex, the one provider with a built-in browser login path. Environment variables override
workspace configuration. Credentials are read from `~/.workboost/agent/auth.json` by default; a
legacy `~/.pi/agent/auth.json` is copied there once on first use, and OAuth refreshes are written
back safely without changing other providers. Provider changes take effect
after an API restart; there is no automatic provider fallback. When `AI_PROVIDER=openai-codex`,
the browser Copilot drawer can start device-code login without exposing tokens to the browser.
OAuth credentials remain in the server-side pi credential file and can be removed with the
drawer's Log out action.

### Platform tokens vs subscriptions

The two switches that control a messaging platform are independent:

- **Capability (`.env`)**: `SLACK_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` decide whether the platform's
  transport is wired into the API at startup. Without a token, the platform cannot send or
  receive anything.
- **Intent (subscription)**: `/subscribe` and `/unsubscribe` (stored in
  `.workboost/config.json` under `platforms`) decide whether scheduled jobs such as the daily
  summary target that platform.

A subscription for a platform whose token is missing is logged as a warning by the scheduler
instead of being silently dropped.

### Plugins

Drop `.ts`, `.js`, or `.mjs` files into `~/.workboost/plugins/` to load custom extensions at
startup. Plugin code runs inside the API process with full permissions - only add files you
trust.

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

Daily summaries are enabled by default when you message the bot with `/start`,
and arrive around 6pm covering the last 24 hours. To change the time:

```bash
# Full cron format (default: 6:00 PM daily)
DAILY_SUMMARY_SCHEDULE="0 18 * * *"
```

## Development

### Running Locally

```sh
# Development server with hot reload
deno task dev

# Production API server
deno task start
```

### Code Quality

```sh
# Lint with auto-fix
deno task lint:fix

# Lint check
deno task lint

# Format code
deno task format

# Format check
deno task format:check

# Run all checks (CI)
deno task check:ci
```

### Testing

```sh
deno test
```

## Tech Docs

- 📐 [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design, tech stack, data flow
- 📚 [ADRs](docs/adr) - Architecture Decision Records
- 🖥️ [Desktop shell](apps/desktop/README.md) - Tauri 2 shell and API sidecar

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
