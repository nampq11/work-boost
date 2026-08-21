---
type: ADR
id: "0001"
title: "Integrate assistant-ui at the frontend boundary"
status: active
date: 2026-08-21
---

## Context
The browser Copilot needs assistant-ui primitives, Markdown/GFM rendering, paired user and assistant messages, progressive feedback, copy actions, and cancellation. The existing API returns complete synchronous responses rather than token chunks.

## Decision
**Keep assistant-ui inside the web application: pin its frontend dependencies, adapt its primitives for message pairs, reveal complete responses on the client, and use a local loading element until text arrives.**

## Options considered
- **Adapt assistant-ui at the frontend boundary** (chosen): preserves the existing API and runtime behavior without importing framework-specific registry code.
- Add server-side token streaming: provides true streaming, but changes the synchronous API contract.
- Replace assistant-ui with a custom thread: offers control, but duplicates runtime, Markdown, action, and cancellation behavior.

## Consequences
The API contract remains stable and Markdown stays safely rendered after the client reveal. The loading animation is presentation-level rather than network-level streaming, and assistant-ui upgrades remain explicit through pinned frontend dependencies.
