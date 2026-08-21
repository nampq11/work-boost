---
name: frontend-debug
description: Debug browser-side frontend failures by reproducing them in a real browser, inspecting Chrome console and network logs, identifying root causes, and validating fixes. Use when asked to "debug frontend", "debug blank screen", "inspect Chrome console", "check browser logs", "fix runtime error", or "debug submit crash".
---

Debug frontend failures from an end-user reproduction, not from code inspection alone.

## Step 1: Establish the reproduction

1. Read the repository's `AGENTS.md`, `CLAUDE.md`, and local rules before editing.
2. Identify the exact user action that fails: navigation, reload, submit, streaming, or interaction.
3. Start the required frontend and API processes using the repository's documented commands.
4. Verify ports before opening the browser. Do not start duplicate servers on fallback ports without telling the user.
5. Reproduce the failure in Chrome with the same action sequence.
6. Record the visible result, URL, process state, and whether the failure occurs once or repeatedly.

Use a reproduction table:

| Action | Expected | Actual | Reproducible |
|---|---|---|---|
| Submit the form | Response renders | Page becomes blank | Yes |

## Step 2: Capture browser evidence

Use the Chrome CDP skill when available. Load the page, then collect:

- Accessibility snapshot or DOM around the failing UI.
- Console errors and warnings.
- Uncaught exceptions and rejected promises.
- Failed requests and HTTP responses with status 400 or higher.
- Screenshot when layout or a blank state is part of the failure.

Prefer a persistent CDP session so console events are captured while reproducing the action. Capture `Runtime.exceptionThrown`, `Runtime.consoleAPICalled`, `Log.entryAdded`, `Network.loadingFailed`, and error HTTP responses.

For React failures, prioritize messages such as:

```text
The result of getSnapshot should be cached to avoid an infinite loop
Maximum update depth exceeded
```

Treat the first actionable exception as the likely root cause. Do not patch the blank screen itself.

## Step 3: Trace the failure to code

1. Map the console stack frame to the owning component or module.
2. Inspect the complete relevant file before editing.
3. Follow the data path from the user action through state updates, network requests, and rendering.
4. Check whether a new state selector, stream update, effect, or event listener returns unstable values or updates state recursively.
5. Compare the failing path with the nearest working path.

For React external-store selectors, keep snapshots referentially stable:

```tsx
// Risky: creates a new array every store read.
const toolCalls = useAuiState((state) =>
  state.message.content.filter((part) => part.type === 'tool-call'),
);

// Safer: subscribe to the stable source, then derive during render.
const messageContent = useAuiState((state) => state.message.content);
const toolCalls = messageContent.filter((part) => part.type === 'tool-call');
```

Do not assume every `filter`, `map`, object spread, or array literal is safe inside a subscription selector. Confirm the selector contract first.

## Step 4: Fix the root cause

1. Write or update a focused regression test when the behavior can be tested without a browser.
2. Make the smallest change that removes the root cause.
3. Preserve the user's event order, cancellation behavior, and error handling.
4. Avoid hiding console errors, adding broad error boundaries, or forcing reloads as substitutes for a fix.
5. Keep debug logging temporary unless it is required for production diagnostics.

## Step 5: Validate in layers

Run the narrowest checks first, then the end-to-end reproduction:

1. Focused unit or adapter test.
2. Type check.
3. Lint and formatting.
4. Production build.
5. Chrome reproduction with the original action sequence.

The browser validation passes only when:

- The expected UI remains mounted.
- The expected response or state change is visible.
- No new uncaught exceptions or React warnings appear.
- Relevant network requests complete or fail with an expected, handled error.
- The development server remains alive after reloads and aborted requests.

If the browser test still fails, return to Step 2 and capture new evidence before changing code again.

## Report format

Report the result concisely:

```text
Root cause: [specific failing state transition or exception]
Fix: [file and behavior changed]
Browser verification: [original action and observed result]
Checks: [tests, type check, lint, build]
```

Do not report a fix as complete without the browser verification result.
