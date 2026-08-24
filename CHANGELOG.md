# Changelog

All notable changes to Work Boost will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Desktop application** (#28) - Added a Tauri 2 desktop shell wrapping the web app with a bundled Deno API sidecar.
- **Configurable AI provider credentials** (#25) - AI provider and model can now be configured instead of being hardcoded.
- **Copilot chat workspace** (#26) - Replaced the ad-hoc copilot panel with an `assistant-ui`-based thread featuring streamed tool timelines and clickable file paths in assistant responses. #26
- **Today capture** (#30) - Added a daily capture box on the Today view that routes free-form notes through the shared copilot thread, auto-opening it on capture, with automatic note creation via the new `create_note` tool. #30
- **Internationalization** - Replaced hardcoded UI strings with an i18n catalog to prepare for translations.

### Changed

- Extracted a shared UI package with design tokens and Base UI dropdown components. #29
- Consolidated Telegram debt commands into a conversational flow instead of separate commands.
- Consolidated the Brain's workspace tools into generic action-based tools (`debt`, `daily_work`, `workspace`) with a new `workspace` search (grep) action, replacing the dozen narrow per-operation tools.

### Fixed

- Fixed the scheduler so the daily report runs by default without extra configuration.
- Stabilized HTML app loading and startup in the web app.

## [0.2.0] - 2026-08-20

### Added

- **Workspace web application** - Browse, edit, autosave, search, and restore workspace files; inspect Markdown front matter; preview HTML apps; and use the AI copilot.
- **Extension system** (#22) - Added built-in and user-loadable extensions that can register HTTP routes and scheduled jobs.
- **Workspace-aware AI tools** (#21) - Added tools for managing debts and daily work, checking time, and reading workspace files.

- **Telegram Bot Integration** (#13) - Full Telegram bot support using grammY framework
  - Unified `BotService` interface for both Slack and Telegram platforms
  - Platform-specific message formatters (HTML for Telegram, plain text for Slack)
  - Multi-platform subscription model - users can subscribe to one or both platforms
  - Inline keyboard menus for better UX
  - Commands: `/start`, `/subscribe`, `/unsubscribe`, `/status`, `/help`
  - Configurable daily summary schedule via `DAILY_SUMMARY_SCHEDULE` environment variable
  - Rate limiting and auto-retry protection

### Fixed

- Improved Slack and Telegram message reliability with request timeouts, per-session agent turn isolation, safe output formatting, and a plain-text fallback for invalid Telegram HTML. #21
- Fixed stale workspace selections and invalid trash paths in the web application.
- **Deno Deploy Compatibility** (#14) - Replaced Node.js-specific `crypto.subtle.timingSafeEqual` with custom timing-safe string comparison function

### Changed

- **Breaking** - Replaced Deno KV storage with a single-user, local-first Markdown workspace. #20
- Extended Deno KV with subscription support for multi-platform management

### Documentation

- Updated README.md with Telegram setup instructions via BotFather
- Updated .env.example with Telegram environment variables
- Updated CLAUDE.md with bot architecture and subscription model details

## [0.1.0] - 2025-02-09

### Added

- Biome formatter with single quotes, 2 spaces, 100 char line width
- Oxlint for fast TypeScript linting with Deno support
- CLAUDE.md with comprehensive project documentation
- Deno tasks for lint/format/check workflows

## [0.0.1] - 2025-02-05

### Added

- Claude Code GitHub Actions workflow
- Initial Work Boost project structure
- Slack integration for daily summaries
- Express API server with CORS, Helmet, rate limiting
- Winston logger with colorized console/file formats
- Google Generative AI integration
- Deno KV storage foundation
