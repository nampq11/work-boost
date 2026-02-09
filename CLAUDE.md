# Work Boost - Project Guide

## Overview

Work Boost is a productivity Slack bot for managing and tracking daily work tasks. Built with Deno + TypeScript.

## Tech Stack

- **Runtime**: Deno with `nodeModulesDir: "auto"`
- **Language**: TypeScript
- **Database**: Deno KV
- **AI**: Google Generative AI
- **API**: Express.js
- **Formatter**: Biome
- **Linter**: Oxlint

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

- **Biome**: `biome.json` - Single quotes, 2 spaces, 100 char line width
- **Oxlint**: `.oxlintrc.json` - TypeScript rules enabled, Deno environment

## Environment Variables

```bash
GOOGLE_API_KEY=your_google_api_key
```

## Project Structure

```
src/
├── main.ts              # Entry point
├── entity/              # Data models
├── services/            # Business logic
├── core/                # Core utilities
└── app/                 # Express app
```
