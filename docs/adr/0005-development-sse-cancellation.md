---
type: ADR
id: "0005"
title: "Treat expected development SSE disconnects as cancellation"
status: active
date: 2026-08-20
---

## Context
Development clients frequently disconnect from SSE streams during reloads or navigation. Logging these expected cancellations as failures obscures real server and Vite errors.

## Decision
**Close server streams on `Request.signal.abort` and filter only cancellation errors in Deno's `onError` hook and Vite.**

## Options considered
- **Filter only cancellation failures** (chosen): reduces noise without hiding unexpected errors.
- Suppress all development errors: quiet, but unsafe for debugging.
- Leave disconnects as errors: preserves every log, but makes development output misleading.

## Consequences
Reload-related disconnects are quiet and resources close promptly. The cancellation classification must remain narrow so real stream failures continue to surface.
