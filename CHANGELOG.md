# Changelog

All notable changes to Work Boost will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Telegram Bot Integration** (#13) - Full Telegram bot support using grammY framework
  - Unified `BotService` interface for both Slack and Telegram platforms
  - Platform-specific message formatters (HTML for Telegram, plain text for Slack)
  - Multi-platform subscription model - users can subscribe to one or both platforms
  - Inline keyboard menus for better UX
  - Commands: `/start`, `/subscribe`, `/unsubscribe`, `/status`, `/help`
  - Configurable daily summary schedule via `DAILY_SUMMARY_SCHEDULE` environment variable
  - Rate limiting and auto-retry protection

### Fixed

- **Deno Deploy Compatibility** (#14) - Replaced Node.js-specific `crypto.subtle.timingSafeEqual` with custom timing-safe string comparison function

### Changed

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
