---
type: ADR
id: "0021"
title: "Split platform capability from delivery subscription"
status: active
date: 2026-08-28
---

## Context
A messaging platform has two independent on/off states. The environment decides whether the
transport exists: `TELEGRAM_BOT_TOKEN` / `SLACK_BOT_TOKEN` gate extension registration in the API
bootstrap. The workspace config (`platforms.slack.enabled`, `platforms.telegram.enabled`, synced
with the subscription) expresses delivery intent for scheduled jobs. Today a subscription can
target a platform whose transport is missing, and the scheduler silently skips the delivery, which
looks like a lost daily summary.

## Decision
**Environment tokens own capability (transport wiring); the workspace subscription owns intent
(per-platform delivery). When a subscribed platform has no connected transport, the scheduler
logs an explicit warning instead of skipping silently.**

## Options considered
- **Two owners plus send-time warning** (chosen): keeps secrets out of workspace config and keeps
  subscription UX (`/subscribe`) intact; failures become diagnosable.
- Config file as the single owner: would move bot tokens and signing secrets into
  `.workboost/config.json`, expanding the secret surface.
- Environment as the single owner: would remove per-platform subscription toggles that the
  Telegram commands already manage.

## Consequences
Bootstrap registration stays env-gated; subscription flags stay user-managed via bot commands.
Adding a new platform requires both a token and a subscription before anything is delivered, and
half-configured setups now produce an actionable log line. A platform whose transport disappears
at runtime degrades to a warning, not silent data loss.
