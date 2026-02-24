---
status: pending
priority: p2
issue_id: "002"
tags:
  - code-review
  - reliability
  - error-handling
dependencies: []
---

# Inconsistent Error Handling Across Brain Capabilities

## Problem Statement

Error handling in the Brain capabilities is inconsistent:
1. Some capabilities return structured error objects
2. Some throw exceptions that aren't caught
3. Some return plain error strings
4. No standard error types or codes

This makes debugging difficult and can lead to unexpected behavior.

## Findings

### Affected Files

- `src/core/brain/capabilities.ts` - All capability functions
- `src/core/brain/tools.ts` - All tool functions

### Evidence

**In capability execute functions:**
```typescript
// Some return structured error
return {
  success: false,
  error: error instanceof Error ? error.message : 'Unknown error occurred',
};

// Some don't handle specific error cases
const parsed = JSON.parse(response.text); // Could throw, caught by outer try/catch
```

**In tool execute functions:**
```typescript
// All tools return structured errors
return {
  success: false,
  error: `${platform} service not available`,
};
```

### Current Behavior

- Errors are caught but not categorized
- No error codes for programmatic handling
- Generic error messages
- No distinction between retryable vs fatal errors

### Expected Behavior

- Standardized error types
- Error codes for common scenarios
- Retry information included
- Detailed logging context

## Proposed Solutions

### Solution 1: Define Standard Error Types (Recommended)

**Description:** Create a `BrainError` class with error codes and retry information.

**Pros:**
- Consistent error handling
- Programmatic error classification
- Better debugging
- Can implement retry logic

**Cons:**
- More boilerplate
- Requires updating existing error handling

**Effort:** Small

**Risk:** Low

**Implementation:**
```typescript
// src/core/brain/errors.ts
export enum ErrorCode {
  // LLM errors
  LLM_API_ERROR = 'LLM_API_ERROR',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  LLM_RATE_LIMITED = 'LLM_RATE_LIMITED',
  LLM_INVALID_RESPONSE = 'LLM_INVALID_RESPONSE',

  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_UNAVAILABLE = 'TOOL_UNAVAILABLE',

  // Capability errors
  CAPABILITY_NOT_FOUND = 'CAPABILITY_NOT_FOUND',
  CAPABILITY_FAILED = 'CAPABILITY_FAILED',

  // Input errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_PARAM = 'MISSING_REQUIRED_PARAM',
}

export class BrainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable: boolean = false,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'BrainError';
  }
}

// Usage in capabilities
throw new BrainError(
  ErrorCode.LLM_RATE_LIMITED,
  'Rate limited by Gemini API',
  true, // retryable
);
```

### Solution 2: Add Error Result Type

**Description:** Extend `CapabilityResult` with more detailed error information.

**Pros:**
- Smaller change
- Maintains existing return pattern
- Adds structured error info

**Cons:**
- Less flexible than exceptions
- Still requires updating all error returns

**Effort:** Small

**Risk:** Low

### Solution 3: Keep Current Pattern, Add Logging

**Description:** Keep current error handling but add comprehensive error logging.

**Pros:**
- Minimal code changes
- Improves debugging

**Cons:**
- Doesn't fix programmatic handling
- Still inconsistent

**Effort:** Small

**Risk:** Very Low

## Recommended Action

**Implement Solution 1** - Define standard error types with error codes.

1. Create `src/core/brain/errors.ts`
2. Add `BrainError` class with `ErrorCode` enum
3. Update capabilities to throw/catch `BrainError`
4. Add retry logic for retryable errors
5. Update error responses to include error codes

## Technical Details

### Affected Components

- `src/core/brain/capabilities.ts` - All capabilities
- `src/core/brain/tools.ts` - All tools
- `src/core/brain/brain.ts` - Error handling in run methods
- `src/core/brain/types.ts` - Result types

### Breaking Changes

None - internal only, external API unchanged.

### Testing Requirements

- [ ] Test all error codes are returned correctly
- [ ] Test retryable errors trigger retry logic
- [ ] Test error messages are helpful
- [ ] Test error logging captures context

### Rollback Plan

Revert to previous error handling pattern.

## Acceptance Criteria

- [ ] `BrainError` class defined with error codes
- [ ] All capabilities use `BrainError`
- [ ] All tools use `BrainError`
- [ ] Error responses include error codes
- [ ] Retry logic implemented for retryable errors
- [ ] Error tests added

## Work Log

| Date | Action | Result |
|------|--------|--------|
| 2025-02-24 | Initial code review | Issue identified |

## Resources

- Error handling best practices: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
