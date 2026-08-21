---
type: ADR
id: "0003"
title: "Sandbox workspace HTML apps"
status: active
date: 2026-08-20
---

## Context
Workspace HTML apps run inside the WorkBoost shell but must not access host cookies, storage, or arbitrary parent capabilities. Existing seeded apps still need scripts, forms, and a controlled way to request external navigation.

## Decision
**Load HTML apps in an iframe with `allow-scripts allow-forms`, omit `allow-same-origin` from the sandbox, and mediate external links through a validated `postMessage` bridge.**

## Options considered
- **Use a restricted sandbox and validated bridge** (chosen): limits host access while preserving required app behavior.
- Render apps directly in the shell: simpler, but removes the isolation boundary.
- Use a fully permissive iframe: compatible, but grants unnecessary capabilities.

## Consequences
Apps receive an opaque origin and cannot use host cookies or storage. The shell must validate bridge messages and explicitly decide which external URLs may open.
