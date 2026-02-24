---
status: pending
priority: p2
issue_id: "003"
tags:
  - code-review
  - security
  - validation
dependencies: []
---

# Missing Input Validation in Tool Execution

## Problem Statement

Tools in `src/core/brain/tools.ts` accept parameters from the LLM but don't validate them before execution. This could lead to:

1. Injection attacks if LLM is tricked
2. Crashes from invalid data types
3. Unintended actions (e.g., wrong chatId)
4. No sanitization of user-controlled input

## Findings

### Affected Files

- `src/core/brain/tools.ts` - All tool `execute` functions
- `src/core/brain/brain.ts` - Tool parameter passing

### Evidence

**send_message tool:**
```typescript
// No validation of chatId format, content sanitization, etc.
execute: async (params: unknown) => {
  const { platform, chatId, text, parseMode } = params as SendMessageParams;
  // chatId could be ANY string - no validation
  // text is not sanitized - could contain injection attempts
  await service.sendMessage(chatId, text, { parseMode });
}
```

**send_slack_blocks tool:**
```typescript
// No validation of blocks structure
execute: async (params: unknown) => {
  const { chatId, blocks } = params as { chatId: string; blocks: unknown[] };
  // blocks could be malformed - no schema validation
  await slack.sendMessage(chatId, '', { keyboard: blocks as KeyboardButton[][] });
}
```

### Current Behavior

- Parameters are type-cast without validation
- No schema validation for complex types
- No sanitization of text content
- No bounds checking

### Expected Behavior

- Validate parameter types before casting
- Sanitize user input
- Validate complex structures
- Return meaningful error for invalid input

## Proposed Solutions

### Solution 1: Add Parameter Validation Function (Recommended)

**Description:** Create a validation utility that all tools use before execution.

**Pros:**
- Centralized validation logic
- Consistent error messages
- Easy to extend

**Cons:**
- Requires validation schemas
- More boilerplate per tool

**Effort:** Medium

**Risk:** Low

**Implementation:**
```typescript
// src/core/brain/validation.ts
export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: unknown;
}

export function validateToolParams<T extends Record<string, unknown>>(
  params: unknown,
  schema: ParamSchema<T>,
): ValidationResult {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Parameters must be an object' };
  }

  const data = params as Record<string, unknown>;

  for (const [key, spec] of Object.entries(schema)) {
    const value = data[key];

    if (spec.required && (value === undefined || value === null)) {
      return { valid: false, error: `Missing required parameter: ${key}` };
    }

    if (value !== undefined) {
      if (spec.type === 'string' && typeof value !== 'string') {
        return { valid: false, error: `Parameter ${key} must be a string` };
      }
      if (spec.type === 'number' && typeof value !== 'number') {
        return { valid: false, error: `Parameter ${key} must be a number` };
      }
      // ... more validation
    }
  }

  return { valid: true, data: params as T };
}

// Usage in tools
execute: async (params: unknown) => {
  const validation = validateToolParams(params, {
    platform: { type: 'string', required: true },
    chatId: { type: 'string', required: true, pattern: '^[A-Za-z0-9_-]+$' },
    text: { type: 'string', required: true, maxLength: 4000 },
  });

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  const { platform, chatId, text } = validation.data as SendMessageParams;
  // ... execute
}
```

### Solution 2: Use Zod for Validation

**Description:** Use Zod library for runtime type validation.

**Pros:**
- battle-tested library
- Excellent TypeScript integration
- Concise schemas

**Cons:**
- Adds dependency
- Additional package size

**Effort:** Medium

**Risk:** Low

### Solution 3: Manual Validation per Tool

**Description:** Add validation directly in each tool's execute function.

**Pros:**
- No external dependencies
- Full control

**Cons:**
- Code duplication
- Inconsistent validation
- More boilerplate

**Effort:** Medium

**Risk:** Low

## Recommended Action

**Implement Solution 1** - Add centralized parameter validation function.

1. Create `src/core/brain/validation.ts`
2. Define `validateToolParams()` function with schema support
3. Add validation for all tool parameters:
   - `chatId`: format validation
   - `text`: length limits, sanitization
   - `blocks`: structure validation
   - `keyboard`: structure validation
4. Update all tools to use validation
5. Add unit tests for validation

## Technical Details

### Affected Components

- `src/core/brain/tools.ts` - All tool `execute` functions
- New file: `src/core/brain/validation.ts`
- `src/core/brain/types.ts` - Validation types

### Breaking Changes

None - validation errors return same error format.

### Testing Requirements

- [ ] Test valid parameters pass validation
- [ ] Test invalid parameters are rejected
- [ ] Test error messages are helpful
- [ ] Test sanitization removes dangerous content
- [ ] Test edge cases (empty strings, null, etc.)

### Rollback Plan

Remove validation calls from tools.

## Acceptance Criteria

- [ ] `validateToolParams()` function implemented
- [ ] All tools validate parameters before execution
- [ ] `chatId` format validated
- [ ] `text` length limited and sanitized
- [ ] Complex structures validated
- [ ] Unit tests for validation
- [ ] Security tests for injection attempts

## Work Log

| Date | Action | Result |
|------|--------|--------|
| 2025-02-24 | Initial code review | Issue identified |

## Resources

- Input validation OWASP: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- Zod validation: https://zod.dev/
