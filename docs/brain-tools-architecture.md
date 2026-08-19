# Brain Tools Architecture

## Overview

The Brain agent now supports **tool calling** (function calling) and a **capabilities system** for handling different types of user interactions. This follows the agent-builder philosophy:

> Give the model capabilities and let it reason.

## Architecture Change

### Before (Structured Output Only)

```
User Input → LLM → JSON Response → Parse → Format → Send to Slack/Telegram
```

The LLM was asked to return structured JSON, which we then parsed and formatted.

### After (Tools + Capabilities)

```
User Input → Route to Capability → LLM processes → Tool Call (optional) → Send to Slack/Telegram
```

The LLM now:
1. Uses **capabilities** to handle different input types (chat, work reports, debt entries)
2. Calls **tools** directly with platform-specific parameters when needed

## Capabilities System

Capabilities define WHAT the brain can do. Each capability handles a specific type of interaction.

### `packages/brain/src/capabilities.ts`

Available capabilities:

| Capability | Description | Returns |
|-----------|-------------|---------|
| `chat` | General conversation, casual chat | Plain text |
| `daily-work-report` | Parse and format work updates | Structured JSON |
| `parse-debt-entry` | Parse debt descriptions | Structured JSON |

**Default capability**: `chat` - Used when no specific capability is requested.

### Capability Routing

```typescript
// General chat (default)
const result = await brain.run("xin chào");
// → Uses 'chat' capability → returns plain text

// Specific capability
const result = await brain.run("hôm nay tôi hoàn thành task A", {
  capability: 'daily-work-report'
});
// → Uses 'daily-work-report' capability → returns structured data
```

## Tools System

Tools define HOW the brain interacts with external services (Slack, Telegram).

### `packages/brain/src/tools/index.ts`

Available tools:

- **`send_message`**: Send a text message to Slack or Telegram
- **`send_slack_blocks`**: Send formatted Slack messages with blocks
- **`send_telegram_keyboard`**: Send Telegram messages with inline keyboards
- **`format_daily_report`**: Format a daily work report for display
- **`format_debt_entry`**: Format a debt entry for display

Each tool has:

- `name`: The tool identifier
- `description`: What the tool does (visible to LLM)
- `parameters`: Schema of expected parameters
- `execute`: The actual function that runs

## New/Updated Files

### `packages/brain/src/types.ts`

Added new types:

- `Tool`: A callable tool with name, description, parameters, execute function
- `ToolCall`: A tool call from the LLM
- `ToolResult`: The result of executing a tool
- `ToolPlatform`: 'slack' | 'telegram'
- `SendMessageParams`: Parameters for sending messages

### `packages/brain/src/brain.ts`

Added new methods:

- `runWithTools()`: Run the agent loop with tool calling support
- `executeTool()`: Execute a specific tool directly
- `getTools()`: Get available tools

The `init()` method now accepts optional `slack` and `telegram` services to initialize tools.

### `packages/brain/src/capabilities.ts`

- Added `createChatCapability()` for general conversation
- `chat` is now the default capability
- Fixed `daily-work-report` to use proper JSON schema

### `packages/brain/src/index.ts`

Re-exports the tools module.

## Usage Examples

### Basic Chat (Default)

```typescript
import { Brain } from './core/brain/index.ts';

const brain = await Brain.init({
  apiKey: env.get('GEMINI_API_KEY'),
  model: 'gemini-2.5-flash',
});

// Simple chat - uses 'chat' capability by default
const result = await brain.run("xin chào");
console.log(result.response); // "Xin chào! Bạn khỏe không?"
```

### With Tool Calling

```typescript
import { Brain } from './core/brain/index.ts';
import { SlackService } from './extensions/slack/slack.ts';
import { TelegramService } from './extensions/telegram/telegram.ts';

// Initialize with services
const slack = new Slack();
const telegram = new TelegramService(db, agent);

const brain = await Brain.init(
  {
    apiKey: env.get('GEMINI_API_KEY'),
    model: 'gemini-2.5-flash',
  },
  slack,
  telegram,
);

// Run with tool calling
const result = await brain.runWithTools(userMessage, {
  sessionId: 'user-123',
  platform: 'telegram',
  chatId: '123456789',
});

// The LLM will automatically call tools as needed
```

### Specific Capability

```typescript
// Force use of a specific capability
const result = await brain.run("hôm nay hoàn thành task A", {
  capability: 'daily-work-report'
});
```

## Benefits

1. **Less Code**: No need to manually parse and format LLM JSON responses
2. **More Flexible**: LLM can call tools in any order based on context
3. **Type Safe**: Tools have explicit parameter schemas
4. **Platform Aware**: LLM knows which platform it's responding to
5. **Easier to Extend**: Adding new tools/capabilities is just adding a new function
6. **Natural Chat**: Users can have casual conversations without JSON errors

## Tool & Capability Philosophy

Following agent-builder principles:

- **3-5 tools to start**: We have 5 core tools
- **3 capabilities for common tasks**: chat, work reports, debt entries
- **Add when needed**: Only add more when the agent consistently fails
- **Trust the model**: Let the LLM decide which tools/capabilities to use
- **Keep it simple**: Each tool/capability does one thing well

## Future Enhancements

Potential tools to add:

- `send_debt_reminder`: Send scheduled debt reminders
- `get_user_status`: Get user's subscription status
- `format_debt_summary`: Format multiple debts for display
- `create_debt_entry`: Create a new debt entry in the database

Potential capabilities to add:

- `debt-summary`: Generate debt summaries from multiple entries
- `task-planner`: Help plan tasks for the next day

Only add these when real usage reveals the need.
