# Changelog

All notable changes to Work Boost will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.3] - 2026-08-28

### Added

- Desktop self-update now streams live progress phases (downloading, installing, restarting) to the banner and keeps the app responsive by running the installer off the main thread. #70

### Fixed

- Bundled desktop AI and daily data loading now works: the `custom-protocol` feature is enabled at build time, so the API sidecar's HTTP service is reachable instead of the app surfacing `Network request failed` / `Could not load today's data`. #69
- Removed `unsafe-inline` and `unsafe-eval` from the CSP policy by using a per-request nonce, hardening the content-security policy. #56

## [0.4.2] - 2026-08-27

### Fixed

- Bundled desktop daily data and the copilot now load: sidecar HTTP is routed through the Rust shell so the webview's cross-origin, CSP, and mixed-content restrictions no longer block it. #65
- Enforced a stricter minimum length for session IDs, closing a security hole where weak identifiers were accepted. #55
- Fixed `successResponse` crashing on a `204` status with a body by returning a null body. #62

### Changed

- Improved daily-scheduler messaging by sending concurrently with `Promise.allSettled`, so slow deliveries no longer block the rest. #59

## [0.4.1] - 2026-08-27

### Added

- **Dual-port data access** (#41) - Bundled desktop workspaces now open instantly via Tauri IPC raw file I/O instead of waiting on the sidecar, backed by a new `DataPort` abstraction used by the workspace store and copilot adapter. AI, auth, and domain operations continue over HTTP when the sidecar is ready, or degrade with typed unavailable errors.

### Fixed

- Fixed an XSS vulnerability in the Assistant Markdown renderer by sanitizing the HTML output with DOMPurify. #57
- Improved performance of workspace search by reading files concurrently. #48
- Improved performance of debt listing by loading entries concurrently. #49
- Fixed an N+1 query performance bottleneck in message retrieval. #50

## [0.4.0] - 2026-08-26

### Added

- **Desktop self-update banner** - The desktop app checks for a newer release on launch and shows a slim banner with an `Update now` button that runs the existing installer elevated and relaunches; no manual shell command needed.
- Added a stacked, auto-dismissing Sonner-style toast notification with action support and both themes, replacing the previous bottom toast. #39

### Fixed

- The desktop bundle version is now derived from the release tag at build time, so the reported version matches the tag instead of the hardcoded `0.1.0`.

## [0.3.1] - 2026-08-26

### Changed

- Replaced the desktop app icon with the rocket logo from the brand design asset across all platforms; previous bundles shipped a placeholder icon.

### Fixed

- Fixed the one-line installer failing checksum verification on macOS by comparing SHA256 hashes directly instead of relying on `sha256sum -c` filename parsing, which breaks on bundle names containing spaces.
- Aligned the frontmatter inspector with the editor body column.

## [0.3.0] - 2026-08-26

### Added

- **Desktop application** (#28) - Added a Tauri 2 desktop shell wrapping the web app with a bundled Deno API sidecar.
- **Configurable AI provider credentials** (#25) - AI provider and model can now be configured instead of being hardcoded.
- **Copilot chat workspace** (#26) - Replaced the ad-hoc copilot panel with an `assistant-ui`-based thread featuring streamed tool timelines and clickable file paths in assistant responses. #26
- **Today capture** (#30) - Added a daily capture box on the Today view that routes free-form notes through the shared copilot thread, auto-opening it on capture, with automatic note creation via the new `create_note` tool. #30
- **Internationalization** - Replaced hardcoded UI strings with an i18n catalog to prepare for translations.
- **Source editor** (#31) - Added a first-class Markdown source editor for workspace documents, with fixed debt properties on daily notes.
- **One-line installer** (#38) - Added `scripts/install.sh` that installs the desktop app from prebuilt GitHub Releases bundles, plus a release workflow building `.deb`, `.dmg`, and `.msi` artifacts with checksums.
- The Today view now shows the saved Markdown file after a capture instead of only the transcript.
- Moved Archive to the sidebar's top level with drag-and-drop file moves between folders.

### Changed

- Extracted a shared UI package with design tokens and Base UI dropdown components. #29
- Collapsed the Daily view into Today and unified the interface language to English. #33
- Debt settle and delete are now self-resolving, so records update without manual cleanup. #36
- Unified document creation behind a single `create_document` tool. #32
- Shrank the desktop API sidecar bundle from 851MB to 158MB.
- Consolidated Telegram debt commands into a conversational flow instead of separate commands.
- Consolidated the Brain's workspace tools into generic action-based tools (`debt`, `daily_work`, `workspace`) with a new `workspace` search (grep) action, replacing the dozen narrow per-operation tools.

### Fixed

- Fixed the scheduler so the daily report runs by default without extra configuration.
- Stabilized HTML app loading and startup in the web app.
- The Today capture box now supports @ file mentions (files and folders) matching the Copilot composer, instead of sending raw text.
- Fixed daily work messages being lost during processing. #37
- Kept Copilot message layout stable while responses stream in.

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
