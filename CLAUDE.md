# Work Boost - Project Guide

## Repository Guidelines

- Repo: https://github.com/nampq11/work-boost
- GitHub issues/comments/PR comments: use literal multiline strings or `-F - <<'EOF'` for real
  newlines; never embed `"\\n"`.
- GitHub comment footgun: never use `gh issue/pr comment -b "..."` when body contains backticks or
  shell chars. Always use single-quoted heredoc (`-F - <<'EOF'`) so no command substitution/escaping
  corruption.
- GitHub linking: don't wrap issue/PR refs like `#24643` in backticks when you want auto-linking.
  Use plain `#24643`.

## Overview

Work Boost is a personal productivity bot for every day. with core Telegram/slack channels.

## Project Structure & Module Organization

- Source code: `src/` (bot services in `src/services`, entities in `src/entity`, core interfaces in
  `src/core`, All Application (cli/api/web,.v.v) entry point write in `src/app`).

## Build, Test, and Development Commands

- Runtime: **Deno 2+**
- Install deps: `deno install`
- Run CLI in dev: `deno task dev`
- Type-check/build: `deno check **/*.ts`
- Lint/format: `deno task check`
- Format check: `deno task format` (biome check)
- Format fix: `deno task format:fix` (biome check --write)
- Use `deno run --allow-all scripts/docs-list.js` to list all docs to see before implement.
- Tests: `deno test`

## Coding Style & Naming Conventions

- Language: TypeScript (ESM). Prefer strict typing; avoid `any`.
- Formatting/linting via Biome and Oxlint; run `deno task check` before commits.
- Add brief code comments for tricky or non-obvious logic.
- Keep files concise; extract helpers instead of "V2" copies.
- Aim to keep files under ~300 LOC; split/refactor when it improves clarity.
- Naming: use **Work Boost** for product/docs headings; use `work-boost` for CLI, package/binary,
  paths, and config keys.
- Files: `kebab-case.ts` for services/utilities, `PascalCase.ts` for classes/entities.

## Testing

### Running Tests

```bash
deno test
```

### Test Organization

- Place tests next to source files
- Name test files: `filename.test.ts`
- Use `deno test` for running tests

## Commit & Pull Request Guidelines

- Group related changes; avoid bundling unrelated refactors.
- Follow concise, action-oriented commit messages (e.g., `feat: add debt tracking command`).
- Conventional Commits format: `type(scope): description`
  - `feat` - New features
  - `fix` - Bug fixes
  - `refactor` - Code refactoring
  - `chore` - Maintenance tasks
  - `docs` - Documentation changes
  - `test` - Test additions/changes

## Git Notes

- If `git branch -d/-D <branch>` is policy-blocked, delete the local ref directly:
  `git update-ref -d refs/heads/<branch>`.
- Multi-agent safety: do **not** create/apply/drop `git stash` entries unless explicitly requested.
- Multi-agent safety: when the user says "push", you may `git pull --rebase` to integrate latest
  changes (never discard other agents' work). When the user says "commit", scope to your changes
  only.
- Multi-agent safety: do **not** switch branches / check out a different branch unless explicitly
  requested.
- Lint/format churn: if staged+unstaged diffs are formatting-only, auto-resolve without asking.

## GitHub Search (`gh`)

- Prefer targeted keyword search before proposing new work or duplicating fixes.
- Use `--repo nampq11/work-boost` + `--match title,body` first.
- PRs: `gh search prs --repo nampq11/work-boost --match title,body --limit 50 -- "keyword"`
- Issues: `gh search issues --repo nampq11/work-boost --match title,body --limit 50 -- "keyword"`

## Troubleshooting

### Deno KV Issues

```bash
# Clear KV data (development only)
rm -rf ~/.deno/deno_kv_*
```

### Bot Not Responding

1. Verify bot token is correct
2. Check bot has required scopes/permissions
3. Verify ngrok/tunnel URL if testing locally
4. Check logs: `deno task dev`

### Permission Errors

Ensure Deno has required permissions:

- `--allow-net` for network requests
- `--allow-read` for file access
- `--allow-write` for KV storage
- `--allow-env` for environment variables
- `--unstable-kv` for Deno KV
- `--unstable-cron` for cron jobs

### Common Issues

- **Tests failing locally**: Ensure `deno task check` passes before running tests
- **Bot webhooks not working**: Verify ngrok/tunnel URL matches Slack/Telegram configuration
- **KV data corruption**: Clear with `rm -rf ~/.deno/deno_kv_*` and restart

## Security Tips

- Never commit or publish real API keys, bot tokens, or live configuration values.
- Use obviously fake placeholders in docs, tests, and examples.
- Keep secrets in environment variables or `.env` files (never commit `.env`).
- Use `deno.json` with `"unstable": true` only when needed for Deno KV/cron features.
