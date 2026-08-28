---
type: ADR
id: "0006"
title: "Preserve the legacy AI provider default"
status: superseded
date: 2026-08-21
superseded_by: "0022"
---

## Context
Existing workspaces may not have an `ai` configuration section and may still rely on the legacy `GOOGLE_API_KEY` setup. New deployments need explicit provider and model selection.

## Decision
**Unconfigured workspaces resolve to Google with `gemini-2.5-flash`, while configuration and environment overrides can select another supported provider.**

## Options considered
- **Keep a compatible Google default with explicit overrides** (chosen): avoids breaking existing workspaces while enabling configuration.
- Require an `ai` section everywhere: clear for new workspaces, but breaks existing ones.
- Infer providers from whichever credential is present: convenient, but makes selection ambiguous.

## Consequences
Legacy workspaces continue to run. New provider behavior must be tested against explicit configuration and environment precedence.
