---
type: ADR
id: "0002"
title: "Define explicit browser workspace contracts"
status: active
date: 2026-08-20
---

## Context
The workspace specification defines trash, restore, folder creation, and safe Markdown saving, but does not define all endpoint names. The browser Copilot needs a complete response while bot clients continue using the asynchronous message endpoint. Browser saves must also avoid overwriting newer on-disk content.

## Decision
**Use explicit workspace filesystem routes, use `POST /api/message/sync` for browser Copilot turns, and protect Markdown saves with `expectedModifiedAt` returning `409 CONFLICT` for stale writers.**

## Options considered
- **Use explicit, conditional HTTP contracts** (chosen): keeps workspace operations domain-neutral, preserves bot compatibility, and prevents silent data loss.
- Reuse debt-specific routes or accept unconditional saves: simpler initially, but couples unrelated domains and loses concurrent edits.
- Use the asynchronous message endpoint in the browser: would require polling or a separate browser event channel.

## Consequences
The browser has stable contracts for workspace mutations and Copilot responses. Clients must send the document version they edited, and stale saves require user reconciliation.
