---
status: pending
priority: p3
issue_id: "005"
tags:
  - code-review
  - logging
  - operations
dependencies: []
---

# Verbose Logging in Production Code

## Problem Statement

Multiple places in the codebase use `console.log()` for debugging output. This:

1. Clutters production logs
2. May expose sensitive information
3. No way to disable without code changes
4. Inconsistent logging patterns

## Findings

### Affected Files

- `src/core/brain/brain.ts` - Lines 374, 375, 388, 402
- `src/core/brain/capabilities.ts` - Lines 35, 36, 48, 49, 89, 111
- `src/services/slack/slack.ts` - Lines 49, 51

### Evidence

```typescript
// src/core/brain/brain.ts
if (verbose) {
  console.log('Brain response:', response.text);  // ❌ console.log
  console.log('Function calls:', response.functionCalls);  // ❌ console.log
}

// src/core/brain/capabilities.ts
if (verbose) {
  console.log('Chat input: ', message);  // ❌ console.log
  console.log('Chat response: ', response.text);  // ❌ console.log
}

// src/services/slack/slack.ts
console.log('Slack message sent:', responseJson);  // ❌ console.log
console.error('Failed to send Slack message:', error);  // ❌ console.error instead of logger
```

### Current Behavior

- Mix of `console.log`, `console.error`
- `verbose` flag for conditional logging
- No log levels
- No structured logging
- Sensitive data potentially logged

### Expected Behavior

- Use centralized logger
- Log levels (debug, info, warn, error)
- Structured logging
- Redaction of sensitive data
- Configurable log level

## Proposed Solutions

### Solution 1: Replace All Console Statements with Logger (Recommended)

**Description:** Replace all `console.log` and `console.error` with the existing logger from `src/core/logger/logger.ts`.

**Pros:**
- Consistent logging
- Configurable levels
- Better for production
- Sensitive data redaction

**Cons:**
- Requires changes across multiple files
- Need to verify logger is properly initialized

**Effort:** Small

**Risk:** Very Low

**Implementation:**
```typescript
// Before
if (verbose) {
  console.log('Brain response:', response.text);
}

// After
if (verbose) {
  logger.debug('Brain response', { response: response.text });
}

// Before
console.error('Failed to send Slack message:', error);

// After
logger.error('Failed to send Slack message', { error });
```

### Solution 2: Create Debug Helper

**Description:** Create a debug helper that respects environment.

**Pros:**
- Centralized debug logic
- Easy to disable globally

**Cons:**
- Additional abstraction
- Still need to replace all console calls

**Effort:** Small

**Risk:** Very Low

### Solution 3: Keep as-is with Environment Check

**Description:** Only log in development environment.

**Pros:**
- No code changes needed if wrapper exists
- Production stays clean

**Cons:**
- No debug visibility in production when needed

**Effort:** Very Small

**Risk:** Very Low

## Recommended Action

**Implement Solution 1** - Replace all console statements with logger.

1. Import logger in all files using console
2. Replace `console.log` with `logger.debug`
3. Replace `console.error` with `logger.error`
4. Replace `console.warn` with `logger.warn`
5. Add structured logging context
6. Redact sensitive data (tokens, secrets)

## Technical Details

### Affected Components

- `src/core/brain/brain.ts` - 5 instances
- `src/core/brain/capabilities.ts` - 6 instances
- `src/services/slack/slack.ts` - 2 instances
- Any other files with console statements

### Breaking Changes

None - logging output format may change slightly.

### Testing Requirements

- [ ] Verify logs appear correctly in development
- [ ] Verify debug logs don't appear in production
- [ ] Verify error logs always appear
- [ ] Verify sensitive data is redacted

### Rollback Plan

Revert commit, console logging will work again.

## Acceptance Criteria

- [ ] All `console.log` replaced with `logger.debug`
- [ ] All `console.error` replaced with `logger.error`
- [ ] All `console.warn` replaced with `logger.warn`
- [ ] Structured logging context added
- [ ] Sensitive data redacted
- [ ] Tests verify logging behavior

## Work Log

| Date | Action | Result |
|------|--------|--------|
| 2025-02-24 | Initial code review | Issue identified |

## Resources

- Existing logger: `src/core/logger/logger.ts`
