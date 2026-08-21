---
type: ADR
id: "0007"
title: "Keep browser OAuth behind the API"
status: active
date: 2026-08-21
---

## Context
The browser needs authentication status and progress updates, but OAuth exchange and credential persistence are security-sensitive. The first safe browser flow is OpenAI Codex device-code OAuth; reconnects and repeated login requests also need defined behavior.

## Decision
**Keep OAuth execution and credentials in the API-owned `AuthService`, support only OpenAI Codex device-code OAuth in the browser, reject redundant login with `409 AUTH_ALREADY_CONNECTED` unless reauthentication is explicit, and provide bounded SSE replay with a one-second reconnect grace period.**

## Options considered
- **Use an API-owned, narrowly scoped browser flow** (chosen): centralizes credential handling, limits provider exposure, and supports normal reconnects.
- Execute OAuth in the browser or duplicate provider logic in the web app: increases credential exposure and creates divergent implementations.
- Cancel immediately on disconnect and start login every time: simpler, but breaks reconnects and permits redundant flows.

## Consequences
The browser receives only safe status and progress metadata. OpenRouter remains unsupported in the browser, clients must handle the stable already-connected conflict, and abandoned flows are cancelled after the reconnect grace period.
