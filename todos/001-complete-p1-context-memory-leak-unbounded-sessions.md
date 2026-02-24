---
status: complete
priority: p1
issue_id: "001"
tags:
  - code-review
  - performance
  - memory
dependencies: []
---

# Context Memory Leak - Unbounded Session Growth

## Problem Statement

The `ContextManager` in `src/core/brain/context.ts` stores conversation contexts in an in-memory Map without any cleanup mechanism for old/unused sessions. This creates a memory leak where:

1. Every new user/session creates a new entry in the Map
2. Sessions are never automatically removed
3. Each session stores up to 50 messages
4. Over time, this can consume significant memory

**Why it matters:** In a production environment with thousands of users, this will eventually cause the server to run out of memory and crash.

## Findings

### Affected Files

- `src/core/brain/context.ts` - `ContextManager` class
  - Line 15: `private contexts: Map<string, Context>` - never cleared
  - Line 94: `trimContextIfNeeded()` only trims individual messages, not old sessions

### Evidence

```typescript
// src/core/brain/context.ts
export class ContextManager {
  private contexts: Map<string, Context>;  // ❌ Grows unbounded

  constructor() {
    this.contexts = new Map();
  }

  // Only removes manually via removeContext() - no automatic cleanup
  removeContext(sessionId: string): boolean {
    return this.contexts.delete(sessionId);
  }

  // Only trims messages within a session, doesn't remove old sessions
  private trimContextIfNeeded(context: Context, maxMessages: number = 50): void {
    if (context.messages.length > maxMessages) {
      context.messages = context.messages.slice(-maxMessages);
    }
  }
}
```

### Current Behavior

- Sessions accumulate forever
- No TTL or expiration
- No cleanup of stale sessions
- Memory grows linearly with unique users

### Expected Behavior

- Old sessions should be automatically cleaned up
- Sessions inactive for a period should expire
- Memory usage should remain bounded

## Proposed Solutions

### Solution 1: Add Session Expiration with TTL (Recommended)

**Description:** Track `lastUsedAt` timestamp and automatically remove sessions that haven't been used within a configurable TTL period.

**Pros:**
- Simple to implement
- Configurable timeout
- Follows common session management patterns
- Memory usage stays bounded

**Cons:**
- Requires periodic cleanup task
- Users lose context after inactivity (may be desired)

**Effort:** Small

**Risk:** Low

**Implementation:**
```typescript
export class ContextManager {
  private contexts: Map<string, Context>;
  private sessionTTL: number; // milliseconds
  private cleanupInterval: number;

  constructor(sessionTTL: number = 24 * 60 * 60 * 1000) { // 24 hours default
    this.contexts = new Map();
    this.sessionTTL = sessionTTL;
    this.startCleanupTask();
  }

  private startCleanupTask(): void {
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000); // hourly
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, context] of this.contexts) {
      if (now - context.lastUsedAt.getTime() > this.sessionTTL) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      this.contexts.delete(sessionId);
    }
  }
}
```

### Solution 2: LRU Cache with Maximum Size

**Description:** Use an LRU (Least Recently Used) cache pattern with a maximum number of sessions.

**Pros:**
- Guarantees hard memory limit
- Automatic eviction of least recently used
- No background cleanup needed

**Cons:**
- Active users can be evicted during high traffic
- More complex implementation
- Need external LRU library or custom implementation

**Effort:** Medium

**Risk:** Medium

### Solution 3: Persistent Session Storage

**Description:** Move session storage to Deno KV or similar with automatic expiration.

**Pros:**
- Survives server restarts
- Built-in TTL support in Deno KV
- Scales across multiple instances

**Cons:**
- Requires database dependency
- More complex architecture
- Potential latency increase

**Effort:** Large

**Risk:** Medium

## Recommended Action

**Implement Solution 1** - Add session expiration with TTL.

1. Add configurable `sessionTTL` parameter to `ContextManager`
2. Add background cleanup task that runs periodically
3. Remove sessions that exceed TTL
4. Log cleanup activity for monitoring

## Technical Details

### Affected Components

- `src/core/brain/context.ts` - `ContextManager` class
- `src/core/brain/brain.ts` - Pass session TTL through initialization

### Breaking Changes

None - this is additive only.

### Testing Requirements

- [ ] Verify old sessions are cleaned up after TTL
- [ ] Verify active sessions are preserved
- [ ] Verify cleanup doesn't cause memory spikes
- [ ] Test with high concurrent session count

### Rollback Plan

Revert commit, sessions will continue to work (just without cleanup).

## Acceptance Criteria

- [ ] `ContextManager` accepts `sessionTTL` parameter
- [ ] Background cleanup task runs periodically
- [ ] Expired sessions are automatically removed
- [ ] Memory usage remains stable over time
- [ ] Unit tests for cleanup logic
- [ ] Integration test with simulated traffic

## Work Log

| Date | Action | Result |
|------|--------|--------|
| 2025-02-24 | Initial code review | Issue identified |
| 2025-02-24 | Implementation completed | Added sessionTTL to ContextManager with 24h default and hourly cleanup |

## Resources

- [Deno KV TTL Documentation](https://deno.com/manual@v1.38.0/runtime/kv#expiration-and-ttl)
- Similar issue found: `docs/solutions/integration-issues/telegram-bot-grammy-webhook-setup.md`
