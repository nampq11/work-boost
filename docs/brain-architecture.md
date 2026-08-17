---
summary: 'Core AI agent architecture following agent-builder philosophy: capabilities, knowledge, and context management for Work Boost'
read_when:
  - onboarding to the codebase
  - adding new capabilities to the brain
  - understanding how AI agent works
title: 'Brain Architecture Documentation'
---

# Brain Architecture

The Brain is Work Boost's core AI agent, following the **agent-builder philosophy**:

> **The model already knows how to be an agent. Your job is to get out of the way.**

## Philosophy

The brain is a simple loop:

```
LOOP:
  Model sees: context + available capabilities + tools
  Model decides: act or respond
  If act: execute capability/tool, add result, continue
  If respond: return to user
```

**The magic isn't in the code—it's in the model.** This code just provides the opportunity.

## Core Elements

### 1. Capabilities (What can it DO?)

Atomic actions the brain can perform. Start with 3-5 capabilities. Add more only when the brain consistently fails because a capability is missing.

| Capability ID | Description | Returns |
|--------------|-------------|---------|
| `chat` | General conversation and casual chat (default) | Plain text |
| `daily-work-report` | Parse natural language and generate structured daily work reports | Structured JSON |
| `parse-debt-entry` | Parse natural language debt descriptions into structured data | Structured JSON |

**Default capability**: `chat` - Used for general conversation when no specific capability is requested.

### 2. Tools (How does it INTERACT?)

Platform-specific actions for Slack and Telegram. Tools are used with `runWithTools()` for function calling.

| Tool | Description |
|------|-------------|
| `send_message` | Send a text message to Slack or Telegram |
| `send_slack_blocks` | Send formatted Slack messages with blocks |
| `send_telegram_keyboard` | Send Telegram messages with inline keyboards |
| `format_daily_report` | Format a daily work report for display |
| `format_debt_entry` | Format a debt entry for display |

### 3. Knowledge (What does it KNOW?)

Domain expertise injected on-demand. Make knowledge available, not mandatory. Load it when relevant, not upfront.

| Knowledge ID | Description |
|--------------|-------------|
| `daily-work-report-format` | Vietnamese daily work report formatting rules |
| `debt-tracking-rules` | Rules for parsing and categorizing debt entries |

### 4. Context (What has happened?)

The conversation history—the thread connecting actions into coherent behavior. Context is precious:
- Isolate noisy subtasks
- Truncate verbose outputs
- Protect clarity

## Architecture

```
packages/brain/src/
├── types.ts           # Core types (Capability, Tool, Knowledge, Context)
├── brain.ts           # The Brain class (main loop)
├── capabilities.ts    # Atomic capabilities
├── tools.ts           # Platform-specific tools for function calling
├── knowledge.ts       # On-demand domain knowledge
├── context.ts         # Conversation context management
├── prompts/           # AI prompts and schemas
│   ├── daily-work-prompt.ts
│   └── debt-prompt.ts
└── index.ts          # Module exports
```

## Usage

### Basic Initialization

```typescript
import { Brain } from '@/core/brain/index.ts';

const brain = await Brain.init({
  model: 'gemini-2.5-flash',
  apiKey: Deno.env.get('GOOGLE_API_KEY')!,
});
```

### Running the Brain

```typescript
// General chat (uses 'chat' capability by default)
const result = await brain.run('xin chào');
console.log(result.response); // "Xin chào! Bạn khỏe không?"

// Work report processing
const result = await brain.run(
  'hoàn thành: B4: squirrel cải tiến mô hình, dự định làm: B5: squirrel cải tiến mô hình'
);
console.log(result.response);
```

### Using Specific Capabilities

```typescript
// Parse a debt entry
const result = await brain.run('lent 50 to John for lunch', {
  capability: 'parse-debt-entry',
});

// Force work report capability
const result = await brain.run('hôm nay hoàn thành task A', {
  capability: 'daily-work-report',
});
```

### With Tool Calling (Slack/Telegram)

```typescript
import { Slack } from '@/services/slack/slack.ts';
import { TelegramService } from '@/services/telegram/telegram.ts';

// Initialize with services
const slack = new Slack();
const telegram = new TelegramService(db, agent);

const brain = await Brain.init({
  model: 'gemini-2.5-flash',
  apiKey: Deno.env.get('GOOGLE_API_KEY')!,
}, slack, telegram);

// Run with tool calling - LLM can send messages directly
const result = await brain.runWithTools('Send a greeting to the user', {
  sessionId: 'user-123',
  platform: 'telegram',
  chatId: '123456789',
});
```

### Session Management

```typescript
// Create a new session
const sessionId = await brain.createSession();

// Switch to a session
await brain.loadSession(sessionId);

// Run with session context
await brain.run('message', { sessionId });

// List all sessions
const sessions = brain.listSessions();

// Clear a session
brain.clearSession(sessionId);

// Remove a session
await brain.removeSession(sessionId);
```

### Direct Capability Execution

```typescript
const result = await brain.executeCapability(
  'daily-work-report',
  { input: 'completed B4 task, plan to continue B5' },
  { verbose: true }
);
```

## Capabilities

### Chat (Default)

Handles general conversation without expecting structured output.

**Input:**
```
xin chào
```

**Output:**
```
Xin chào! Bạn khỏe không?
```

### Daily Work Report

Parses natural language and generates structured Vietnamese work reports with three sections:

1. **Việc hoàn thành hôm trước?** (Completed tasks)
2. **Việc dự định làm hôm trước nhưng không hoàn thành?** (Incomplete tasks)
3. **Việc dự định làm hôm nay?** (Planned tasks)

**Input:**
```
hoàn thành: B4: squirrel cải tiến mô hình, dự định làm: B5: squirrel cải thiện
```

**Output:**
```
1. Việc hoàn thành hôm trước?
 •  B4: squirrel cải tiến mô hình
2. Việc dự định làm hôm trước nhưng không hoàn thành?
 •  N/A
3. Việc dự định làm hôm nay?
 •  B5: squirrel cải thiện
```

### Parse Debt Entry

Parses natural language debt descriptions into structured data.

**Input:**
```
lent 50 to John for lunch
```

**Output:**
```
Cho vay: 50 USD John (lý do: lunch)
```

## Adding New Capabilities

1. Define the capability in `capabilities.ts`:

```typescript
export function createMyCapability(ai: GoogleGenAI): Capability {
  return {
    id: 'my-capability',
    name: 'My Capability',
    description: 'What this capability does',
    execute: async (input: unknown): Promise<CapabilityResult> => {
      // Your implementation
      return {
        success: true,
        data: result,
      };
    },
  };
}
```

2. Add it to `getAllCapabilities()`:

```typescript
export function getAllCapabilities(ai: GoogleGenAI): Capability[] {
  return [
    createChatCapability(ai),
    createDailyWorkReportCapability(ai),
    createParseDebtCapability(ai),
    createMyCapability(ai),  // Add here
  ];
}
```

3. Add formatting in `brain.ts`:

```typescript
private formatCapabilityResult(capabilityId: string, data: unknown): string {
  switch (capabilityId) {
    case 'chat':
      return typeof data === 'string' ? data : String(data);
    case 'my-capability':
      return formatMyData(data);
    // ... existing cases
  }
}
```

## Adding New Tools

Tools are for platform-specific actions (Slack/Telegram) used with function calling.

1. Define the tool in `tools.ts`:

```typescript
export function createMyTool(slack: Slack | null, telegram: TelegramService | null): Tool {
  return {
    name: 'my_tool',
    description: 'What this tool does',
    parameters: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Parameter description',
        },
      },
      required: ['param1'],
    },
    execute: async (params: unknown) => {
      const { param1 } = params as { param1: string };
      // Your implementation
      return {
        success: true,
        data: { result: 'done' },
      };
    },
  };
}
```

2. Add it to `getAllTools()`:

```typescript
export function getAllTools(
  slack: Slack | null,
  telegram: TelegramService | null,
): Tool[] {
  return [
    createSendMessageTool(slack, telegram),
    createSendSlackBlocksTool(slack),
    createSendTelegramKeyboardTool(telegram),
    createFormatDailyReportTool(),
    createFormatDebtEntryTool(),
    createMyTool(slack, telegram),  // Add here
  ];
}
```

## Testing

```bash
# Run brain tests
deno task test tests/test_agent.ts

# Run with specific file
deno test --allow-all --env-file=.env tests/test_agent.ts
```

## Key Principles

1. **The model IS the agent** - Code just runs the loop
2. **Capabilities enable** - What it CAN do
3. **Knowledge informs** - What it KNOWS how to do
4. **Context connects** - What has happened
5. **Trust the model** - Don't over-engineer
6. **Start simple** - Add complexity only when needed

## Anti-Patterns to Avoid

| Pattern | Problem | Solution |
|---------|---------|----------|
| Over-engineering | Complexity before need | Start simple |
| Too many capabilities | Model confusion | 3-5 to start |
| Rigid workflows | Can't adapt | Let model decide |
| Front-loaded knowledge | Context bloat | Load on-demand |
| Micromanagement | Undercuts intelligence | Trust the model |

## Migration from Old Agent

The Brain replaces the old `src/services/agent` architecture:

| Old | New |
|-----|-----|
| `Agent` class | `Brain` class |
| `envoke()` method | `run()` method (or `runWithTools()` for function calling) |
| `formatToSlack()` | Built into `formatCapabilityResult()` or `send_message` tool |
| Session in-memory | `ContextManager` |
| Prompts in `services/agent/prompts` | `core/brain/prompts` |
| JSON parsing manual | Capabilities handle structured output |
| Platform-specific format code | Tools system (`send_slack_blocks`, `send_telegram_keyboard`) |

## Key Principles

1. **The model IS the agent** - Code just runs the loop
2. **Capabilities enable** - What it CAN do
3. **Tools interact** - How it communicates with external services
4. **Knowledge informs** - What it KNOWS how to do
5. **Context connects** - What has happened
6. **Trust the model** - Don't over-engineer
7. **Start simple** - Add complexity only when needed

See [docs/brain-tools-architecture.md](./brain-tools-architecture.md) for more details on the tools system.
