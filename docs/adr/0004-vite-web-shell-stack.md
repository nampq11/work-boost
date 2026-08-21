---
type: ADR
id: "0004"
title: "Use the existing Vite web shell stack"
status: active
date: 2026-08-20
---

## Context
The web shell needs a browser build and stateful editor UI while the Deno API remains the source of truth for workspace files and events.

## Decision
**Use Vite with React 19, Zustand, Tiptap, and Tailwind v4 in `apps/web`; keep workspace data ownership in the existing Deno API.**

## Options considered
- **Retain the Vite and React stack** (chosen): matches the existing shell and keeps frontend and API responsibilities separate.
- Move to a server-rendered frontend framework: adds a second application model without a current requirement.
- Let the frontend own workspace files: duplicates API authority and persistence rules.

## Consequences
Frontend features follow the package-local Vite lifecycle and state conventions. Workspace mutations continue through API routes and events rather than direct browser filesystem access.
