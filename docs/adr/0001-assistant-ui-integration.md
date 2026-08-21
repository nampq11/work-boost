---
type: ADR
id: '0001'
title: 'Integrate assistant-ui at the frontend boundary'
status: active
date: 2026-08-21
---

## Context

The browser Copilot needs assistant-ui primitives, Markdown/GFM rendering, paired user and assistant
messages, progressive feedback, copy actions, cancellation, durable threads, and reconnectable
responses. A synchronous message endpoint does not provide a durable response lifecycle or real
token streaming.

## Decision

**Keep assistant-ui inside the web application: pin its frontend dependencies, adapt its primitives
for message pairs, use the versioned thread/response API, and consume response events over SSE.**

## Options considered

- **Adapt assistant-ui at the frontend boundary** (chosen): preserves the existing UI runtime while
  mapping it to durable REST resources and an SSE response feed.
- Use WebSocket for assistant responses: supports bidirectional messaging, but adds connection
  lifecycle and infrastructure complexity without a requirement for client-to-server streaming.
- Replace assistant-ui with a custom thread: offers control, but duplicates runtime, Markdown,
  action, and cancellation behavior.

## Consequences

Thread and response resources are durable in the workspace, response cancellation is explicit, and
SSE reconnects can replay response events. assistant-ui upgrades remain explicit through pinned
frontend dependencies. The current agent still exposes provider text deltas through an application
callback, so the transport can evolve independently from the model provider.
