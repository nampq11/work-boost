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

## Amendment: @ file mentions (2026-08-25)

The composer's @-mention picker uses `unstable_useComposerInput()` from assistant-ui 0.15.x to read
the composer text and insert `@path` tokens. This bridge is deprecated-prone, so all usage is
isolated to `CopilotComposer`/`FileMentionMenu` in `apps/web/src/components/ai/`; an upgrade that
renames or removes the hook is a two-file change. Mention syntax is plain human-readable `@path`
(not assistant-ui directive tokens) because the message is persisted verbatim in thread history.

Referenced files are resolved server-side in `AssistantService.executeResponse`: the stored user
message keeps the raw `@path` text, and only the agent turn is augmented with a `[Referenced files]`
block. Because pi-ai's `Message` union has no developer role, this context plus the layered prompt
sections live inside the single `SYSTEM_PROMPT` string rather than a separate message role.

Folder mentions (`@daily`) resolve to a directory listing (files plus subfolders, capped at 50
entries) instead of inlined content; the agent is told to read individual files from the listing
with the workspace tool. A token only counts as a folder reference when the path actually exists as
a workspace directory, so prose like "@john did X" never produces "(not found)" noise.
