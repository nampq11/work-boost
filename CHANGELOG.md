# Changelog

All notable changes to Work Boost will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
