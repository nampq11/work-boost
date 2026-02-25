# Agent Loop Enhancements

This document describes the enhancements made to the Work Boost agent loop, following the agent-builder philosophy.

## Overview

The agent loop has been enhanced with four major features:

1. **Planning Layer** - Analyze what to do before executing
2. **Memory/Knowledge** - Store and retrieve context from KV
3. **Data Access Tools** - Query and modify database entities
4. **Streaming Responses** - Send partial responses as they arrive

## File Structure

```
src/core/brain/
├── planning/
│   ├── types.ts          # Plan, PlanStep, PlanStatus, etc.
│   ├── planner.ts        # Planner class
│   ├── prompts/
│   │   └── plan-prompt.ts # Plan generation prompt
│   └── index.ts          # Exports
├── memory/
│   ├── types.ts          # MemoryEntry, MemoryType, etc.
│   ├── working-memory.ts # Short-term session memory
│   ├── long-term-memory.ts # Persistent KV memory
│   └── index.ts          # Exports
├── data-access/
│   ├── types.ts          # Query/Create/Update params
│   ├── database-tools.ts # DB query tools
│   └── index.ts          # Exports
├── streaming/
│   ├── types.ts          # StreamChunk, StreamOptions, etc.
│   ├── streamer.ts       # Stream response handler
│   └── index.ts          # Exports
└── brain.ts              # Updated Brain class
```

## 1. Planning Layer

### Purpose
The planning layer analyzes what to do before executing. It provides transparency by showing the plan to the user, then executes step-by-step with progress updates.

### Key Types
- `Plan` - A sequence of steps to accomplish a goal
- `PlanStep` - Single step with description, action, parameters
- `PlanStatus` - draft, approved, in_progress, completed, failed, cancelled
- `StepStatus` - pending, in_progress, completed, failed, skipped

### Usage

```typescript
// Create a plan
const planResult = await brain.createPlan(
  "I lent $50 to John for lunch",
  sessionId,
  { maxSteps: 10, requireApproval: false }
);

// Execute the plan
const result = await brain.executePlan(planResult.plan!.id, (progress) => {
  console.log(`${progress.step}/${progress.totalSteps}: ${progress.description}`);
});
```

### Files
- `src/core/brain/planning/types.ts` - Type definitions
- `src/core/brain/planning/planner.ts` - Planner implementation
- `src/core/brain/planning/prompts/plan-prompt.ts` - System prompt for plan generation

## 2. Memory/Knowledge Layer

### Purpose
Memory stores and retrieves relevant context from KV for long-term memory. Following the philosophy: "Make knowledge available, not mandatory. Load it when relevant, not upfront."

### Two Types of Memory

#### Working Memory (Short-term)
- Holds current goal, entities, context for active session
- Automatically cleared after TTL (default: 1 hour)
- Used for: partial results, important entities during execution

#### Long-term Memory (Persistent)
- Stores knowledge that persists across sessions
- Types: preference, fact, context, faq, conversation, pattern
- Retrieved based on relevance to query

### Key Types
- `MemoryEntry` - Stored knowledge with type, content, metadata
- `MemoryType` - PREFERENCE, FACT, CONTEXT, FAQ, CONVERSATION, PATTERN
- `MemorySearchResult` - Memory with relevance score

### Usage

```typescript
// Store a memory
await brain.storeMemory(
  userId,
  MemoryType.PREFERENCE,
  "User prefers Vietnamese language",
  { category: "language" },
  { importance: 0.8 }
);

// Retrieve relevant memories
const { memories } = await brain.retrieveMemories(
  userId,
  "What language does the user prefer?",
  { maxResults: 5, minScore: 0.3 }
);

// Working memory
brain.setWorkingGoal(sessionId, "Parse debt entry from natural language");
brain.setWorkingEntity(sessionId, "debt_amount", 50);
const amount = brain.getWorkingEntity(sessionId, "debt_amount");
```

### Files
- `src/core/brain/memory/types.ts` - Type definitions
- `src/core/brain/memory/working-memory.ts` - Short-term memory implementation
- `src/core/brain/memory/long-term-memory.ts` - Persistent KV memory

## 3. Data Access Tools

### Purpose
Tools enable the agent to query and modify database entities (users, tasks, debts).

### Available Tools
- `query_user` - Look up user information
- `query_task` - Query tasks by user, status
- `query_debt` - Query debts by user, status, direction
- `create_debt` - Create new debt record
- `update_debt` - Update debt status, amount, reason
- `delete_debt` - Delete debt record

### Usage
These tools are automatically available when the Brain is initialized with a Database instance:

```typescript
const brain = await Brain.init(config, slack, telegram, langfuse, db);

// The agent can now use these tools via tool calling
const result = await brain.runWithTools(message, {
  sessionId,
  platform: 'telegram',
  chatId
});
```

### Files
- `src/core/brain/data-access/types.ts` - Parameter types
- `src/core/brain/data-access/database-tools.ts` - Tool implementations

## 4. Streaming Responses

### Purpose
Send partial responses as they arrive from the LLM. Provides better UX for long-running responses.

### Key Types
- `StreamChunk` - Partial response with content and isFinal flag
- `StreamOptions` - Configuration for streaming
- `StreamResult` - Complete result with chunks sent

### Usage

```typescript
// Stream a response
await brain.stream(
  "Tell me a long story",
  async (chunk) => {
    if (!chunk.isFinal) {
      await sendMessage(chatId, chunk.content);
    }
  },
  { sessionId, platform: 'telegram', chatId }
);
```

### Files
- `src/core/brain/streaming/types.ts` - Type definitions
- `src/core/brain/streaming/streamer.ts` - Stream handler

## Updated Brain API

The Brain class now includes these new methods:

### Planning
- `createPlan(userRequest, sessionId, options)` - Create a plan
- `executePlan(planId, onProgress)` - Execute a plan step by step
- `getPlanner()` - Get the Planner instance

### Memory
- `storeMemory(userId, type, content, metadata, options)` - Store long-term memory
- `retrieveMemories(userId, query, options)` - Retrieve relevant memories
- `setWorkingGoal(sessionId, goal)` - Set working memory goal
- `getWorkingGoal(sessionId)` - Get working memory goal
- `setWorkingEntity(sessionId, key, value)` - Store entity in working memory
- `getWorkingEntity(sessionId, key)` - Get entity from working memory
- `clearWorkingMemory(sessionId)` - Clear working memory for session
- `getLongTermMemory()` - Get LongTermMemory instance
- `getWorkingMemory()` - Get WorkingMemory instance

### Streaming
- `stream(message, onChunk, options)` - Stream a response
- `getStreamer()` - Get the Streamer instance

## Philosophy Notes

Following the agent-builder philosophy:

1. **Start simple** - Each enhancement can be used independently
2. **Add complexity only when needed** - Most agents don't need planning or memory
3. **Trust the model** - The planning layer uses the LLM to decide what to do
4. **Context is precious** - Memory is trimmed and cleaned up automatically
5. **Make knowledge available, not mandatory** - Memory is loaded on-demand

## Integration Example

```typescript
// Initialize brain with all features
const brain = await Brain.init(
  { apiKey: GEMINI_API_KEY, model: 'gemini-2.5-flash' },
  slackService,
  telegramService,
  langfuseService,
  database // Enables data access tools and long-term memory
);

// Use planning for complex tasks
const plan = await brain.createPlan(
  "Create a debt entry for $50 lent to John and send confirmation",
  sessionId
);

// Execute with progress updates
await brain.executePlan(plan.plan!.id, (progress) => {
  sendMessage(chatId, `Step ${progress.step}/${progress.totalSteps}: ${progress.description}`);
});

// Store what we learned
await brain.storeMemory(
  userId,
  MemoryType.FACT,
  "John is a friend user often lends money to",
  { person: "John" }
);

// Stream a long response
await brain.stream(
  "Generate a detailed debt summary",
  async (chunk) => {
    if (!chunk.isFinal) {
      await sendMessage(chatId, chunk.content);
    }
  },
  { sessionId, platform: 'telegram', chatId }
);
```
