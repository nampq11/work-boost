---
type: ADR
id: "0022"
title: "Default unconfigured workspaces to the OpenAI Codex provider"
status: active
superseded_by: ""
---

## Context
ADR-0006 set the default provider for unconfigured workspaces to Google Gemini because legacy
workspaces used `GOOGLE_API_KEY`. Google and Z.ai only work with an API key, so a fresh install on
that default lands on a dead-end "no login available" state. The browser OAuth boundary (ADR-0007)
gives OpenAI Codex a guaranteed device-code login path with no key required.

## Decision
**Unconfigured workspaces resolve to `openai-codex` with `gpt-5.4-mini`; explicit config or
`AI_PROVIDER`/`AI_MODEL` overrides still select any supported provider.**

## Options considered
- **Codex default with explicit overrides** (chosen): every fresh install can complete login from
  the browser Copilot drawer; other providers remain one config line away.
- Keep the Google default from ADR-0006: preserves legacy symmetry but fails out of the box
  without an API key.
- Infer provider from whichever credential exists: convenient, but selection becomes ambiguous
  and silently changes when keys are added or removed.

## Consequences
New installs work without any provider configuration. Workspaces that relied on the implicit
Google default must now set `ai.provider` (or `AI_PROVIDER=google` with `GOOGLE_API_KEY`) to keep
Gemini. The override chain (env over config over default) and ADR-0007's OAuth boundary are
unchanged.
