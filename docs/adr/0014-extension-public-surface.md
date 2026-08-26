---
type: ADR
id: "0014"
title: "Narrow the extensions public surface to contract plus factories"
status: active
date: 2026-08-26
---

## Context

The extensions module is a user-facing extension point (built-in integrations plus user plugins in
`~/.workboost/plugins`). Its public barrel (`extensions/mod.ts`) re-exported every internal module,
including concrete services, formatter classes, and scheduler job files. That turns internal
implementations into de-facto public API: they become versioned liabilities the host must support
until they can be deprecated, and they cannot be refactored without breaking consumers.

It also carried duplication (two parallel messaging contracts), dead code (`SlackFormatter`,
`TelegramFormatter`, `KeyboardButton`, `sendBulkMessage`, `sendMessageToChannel`), a Telegram god
object, and scheduler delivery logic that encoded Telegram-specific resilience. The product list
"Extensible" as a principle, so the surface should be stable and narrow rather than leaky.

## Decision

Make the public barrel export only the contract (`types.ts`), the engine (`manager.ts`,
`loader.ts`), and the three built-in factory functions (`slackExtension`, `telegramExtension`,
`schedulerExtension`). Internal implementations remain importable via the
`@work-boost/extensions/<subpath>` mapping for tests, but are no longer part of the documented
public API.

In the same change:

- Unify the messaging contract into a single `ExtensionMessageSender` in `types.ts` (folding in
  `Platform` and `SendOptions`); delete the duplicate `BotService`.
- Remove verified dead code and the `bot/` directory, `formatters/slack-formatter.ts`, and the
  `TelegramFormatter` class (keeping `splitMessage`).
- Split the Telegram service: `wiring.ts` owns middleware and handler registration; `telegram.ts`
  owns delivery, webhook validation/handling, and lifecycle.
- Move the HTML-delivery fallback into `TelegramService.sendMessage` so the scheduler no longer
  carries platform-specific resilience.

We deliberately do NOT build plugin-platform machinery (no manifest, sandbox, permission model, or
registry): Work Boost is a single-user local-first tool with no third-party marketplace, and the
plugin spec marks these out of scope.

## Options considered

- **Narrow the public barrel to contract + factories** (chosen): small stable surface; internals
  evolve freely; lowest doc/versioning burden. Internal classes still accessible via subpaths.
- **Keep the leaky barrel but only remove dead code**: no new files/dirs, but the surface stays
  bloated; refactoring internals still risks breaking consumers.
- **Introduce a plugin manifest / sandbox / registry**: more "correct" for untrusted third-party
  plugins, but heavy over-engineering for a trusted single-user local plugin surface and contrary to
  the product simplicity principle.

## Consequences

- The public `@work-boost/extensions` surface is now small and documented; consumers only depend on
  contract types and factory functions.
- Internal classes (`SlackService`, `TelegramService`, scheduler jobs, formatters) are no longer
  public API, so they can be refactored or reorganized without a breaking change.
- Full re-implementation compatibility: `SlackService`/`TelegramService` are still exported (from
  their subpaths) and the constructor/contract behavior is unchanged, so existing tests stay green.
- Reversal trigger: if a third-party plugin ecosystem is introduced, revisit the surface and add the
  missing machinery (manifest, permission model, registry) via a new ADR rather than editing this one.
