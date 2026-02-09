import { GoogleGenAI } from '@google/genai';
import { logger } from '../../logger/logger.ts';
import { Database } from '../../../services/database/database.ts';
import { Slack } from '../../../services/slack/slack.ts';
import type { Message } from '../../../entity/task.ts';
import type { User } from '../../../entity/user.ts';

// Re-export tool interfaces
export interface Tool {
  name: string;
  description: string;
  execute: (args: string) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// Enhanced tool with metadata
export interface EnhancedTool extends Tool {
  category: 'system' | 'file' | 'network' | 'database' | 'communication';
  dangerous: boolean;
}

// Agent state for persistence
export interface AgentState {
  taskId: string;
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentPlan: string[];
  iteration: number;
  result?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Read file tool
export class ReadTool implements EnhancedTool {
  name = 'read';
  description = 'Read file contents. Use to view source code, config files, logs, etc.';
  category = 'file' as const;
  dangerous = false;

  async execute(args: string): Promise<ToolResult> {
    try {
      const filepath = args.trim();
      const fullPath = filepath.startsWith('/') ? filepath : `/${filepath}`;

      const content = await Deno.readTextFile(fullPath);

      return {
        success: true,
        output: content,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// List files tool
export class LsTool implements EnhancedTool {
  name = 'ls';
  description = 'List files in a directory. Use to explore project structure.';
  category = 'system' as const;
  dangerous = false;

  async execute(args: string): Promise<ToolResult> {
    try {
      const dirpath = args.trim() || '.';
      const fullPath = dirpath.startsWith('/') ? dirpath : `/${dirpath}`;

      const entries = Array.from(Deno.readDirSync(fullPath));
      const output = entries
        .map((e) => `${e.isDirectory ? '[DIR]' : '[FILE]'} ${e.name}`)
        .join('\n');

      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Slack notification tool
export class SlackTool implements EnhancedTool {
  name = 'slack';
  description = 'Send a notification to Slack. Use to report task completion or important updates.';
  category = 'communication' as const;
  dangerous = false;

  async execute(args: string): Promise<ToolResult> {
    try {
      const slack = new Slack();
      const blocks = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: args,
        },
      };

      await slack.sendMessage(blocks);

      return {
        success: true,
        output: 'Message sent to Slack',
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Main Loop Agent with enhanced features
export class MainLoopAgent {
  private ai: GoogleGenAI;
  private tools: Map<string, EnhancedTool>;
  private maxIterations: number;
  private systemPrompt: string;
  private database?: Database;
  private slack?: Slack;
  private userId: string;

  constructor(
    apiKey: string,
    userId: string,
    options?: {
      maxIterations?: number;
      enablePersistence?: boolean;
      enableSlack?: boolean;
    },
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.tools = new Map();
    this.maxIterations = options?.maxIterations ?? 20;
    this.userId = userId;
    this.systemPrompt = this.getSystemPrompt();

    // Register enhanced tools
    this.registerTool(new ReadTool());
    this.registerTool(new LsTool());

    // Initialize services if enabled
    if (options?.enableSlack) {
      this.slack = new Slack();
      this.registerTool(new SlackTool());
    }

    if (options?.enablePersistence) {
      Database.init().then((db) => {
        this.database = db;
      }).catch((err) => {
        logger.error(`Failed to initialize database: ${err}`);
      });
    }
  }

  private getSystemPrompt(): string {
    const toolDescriptions = Array.from(this.tools.values())
      .map((t) => `- ${t.name} [${t.category}]: ${t.description}${t.dangerous ? ' ⚠️ DANGEROUS' : ''}`)
      .join('\n');

    return `You are an advanced autonomous AI agent with enhanced capabilities for complex task execution.

Available tools:
${toolDescriptions}

CAPABILITIES:
- Multi-step planning with iterative refinement
- File system exploration and modification
- Communication via Slack notifications
- Persistent state management

RESPONSE FORMAT:
Respond with a JSON object:
{
  "thought": "your reasoning and planning",
  "plan": ["step1", "step2", "..."],  // current plan steps
  "tool": "tool_name or 'done'",
  "args": "arguments for the tool",
  "needs_review": true/false  // request human review if unsure
}

RULE:
1. Always create a plan before executing
2. Use 'read' and 'ls' to understand the codebase before making changes
3. Execute one tool at a time
4. Update your plan based on new information
5. Set tool to "done" when task is complete
6. Use 'slack' to report important milestones
7. Be cautious with destructive operations`;
  }

  registerTool(tool: EnhancedTool): void {
    this.tools.set(tool.name, tool);
  }

  private async saveState(state: AgentState): Promise<void> {
    if (!this.database) return;

    const message: Message = {
      id: state.taskId,
      userId: state.userId,
      content: JSON.stringify({
        status: state.status,
        plan: state.currentPlan,
        iteration: state.iteration,
        result: state.result,
        error: state.error,
      }),
      date: new Date(),
    };

    await this.database.storeDailyWorkMessage(message);
  }

  private async notifySlack(message: string): Promise<void> {
    if (!this.slack) return;

    try {
      const blocks = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      };
      await this.slack.sendMessage(blocks);
    } catch (error) {
      logger.error(`Slack notification failed: ${error}`);
    }
  }

  async run(task: string, options?: { verbose?: boolean; notifyOnStart?: boolean }): Promise<string> {
    const verbose = options?.verbose ?? true;
    const notifyOnStart = options?.notifyOnStart ?? true;

    // Generate unique task ID
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Initialize state
    const state: AgentState = {
      taskId,
      userId: this.userId,
      status: 'running',
      currentPlan: [],
      iteration: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (verbose) {
      logger.info(`Starting Main Loop Agent (Task: ${taskId})`);
      logger.info(`Task: ${task}`);
    }

    if (notifyOnStart) {
      await this.notifySlack(`🤖 *Agent Task Started*\n*Task:* ${task}\n*ID:* ${taskId}`);
    }

    let messages = [
      {
        role: 'model' as const,
        parts: [{ text: this.systemPrompt }],
      },
      {
        role: 'user' as const,
        parts: [{ text: `Task: ${task}` }],
      },
    ];

    let result = '';
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      state.iteration = iteration;
      state.updatedAt = new Date();

      if (verbose) {
        logger.info(`Iteration ${iteration}/${this.maxIterations}`);
      }

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: messages,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              thought: { type: 'string' },
              plan: { type: 'array', items: { type: 'string' } },
              tool: { type: 'string' },
              args: { type: 'string' },
              needs_review: { type: 'boolean' },
            },
            required: ['thought', 'tool', 'args'],
          },
        },
      });

      if (!response.text) {
        result = 'Error: No response from AI';
        state.status = 'failed';
        state.error = result;
        break;
      }

      let action;
      try {
        action = JSON.parse(response.text);
      } catch {
        result = `Error: Invalid JSON response: ${response.text}`;
        state.status = 'failed';
        state.error = result;
        break;
      }

      // Update plan if provided
      if (action.plan && Array.isArray(action.plan)) {
        state.currentPlan = action.plan;
      }

      if (verbose) {
        logger.info(`Thought: ${action.thought}`);
        if (action.plan) logger.info(`Plan: ${action.plan.join(' → ')}`);
        logger.info(`Tool: ${action.tool}`);
      }

      // Save state
      await this.saveState(state);

      // Check if needs human review
      if (action.needs_review) {
        result = `Task requires human review: ${action.thought}`;
        state.status = 'pending';
        state.result = result;
        break;
      }

      // Check if done
      if (action.tool === 'done') {
        result = action.thought || 'Task completed successfully';
        state.status = 'completed';
        state.result = result;
        break;
      }

      // Execute tool
      const tool = this.tools.get(action.tool);
      if (!tool) {
        const error = `Unknown tool: ${action.tool}`;
        logger.error(error);
        messages.push({
          role: 'user' as const,
          parts: [{ text: `Tool execution failed: ${error}\nTry again with a different tool.` }],
        });
        continue;
      }

      // Warn for dangerous tools
      if (tool.dangerous && verbose) {
        logger.warn(`⚠️  Executing dangerous tool: ${tool.name}`);
      }

      const toolResult = await tool.execute(action.args);

      if (verbose) {
        if (toolResult.success) {
          const preview = toolResult.output.slice(0, 300);
          logger.info(`Output: ${preview}${toolResult.output.length > 300 ? '...' : ''}`);
        } else {
          logger.error(`Error: ${toolResult.error}`);
        }
      }

      // Add result to conversation
      const resultText = toolResult.success
        ? `Tool "${action.tool}" executed successfully.\nOutput:\n${toolResult.output}`
        : `Tool "${action.tool}" failed.\nError: ${toolResult.error}\nPlease try again or use a different approach.`;

      messages.push({
        role: 'model' as const,
        parts: [{ text: response.text }],
      });
      messages.push({
        role: 'user' as const,
        parts: [{ text: resultText }],
      });

      // Rate limiting delay
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (iteration >= this.maxIterations) {
      result = 'Maximum iterations reached. Task may not be complete.';
      state.status = 'pending';
      state.result = result;
    }

    // Save final state
    await this.saveState(state);

    // Notify completion
    if (state.status === 'completed' && notifyOnStart) {
      await this.notifySlack(`✅ *Agent Task Completed*\n*Task:* ${task}\n*Result:* ${result.slice(0, 200)}`);
    } else if (state.status === 'failed' && notifyOnStart) {
      await this.notifySlack(`❌ *Agent Task Failed*\n*Task:* ${task}\n*Error:* ${state.error || 'Unknown error'}`);
    }

    if (verbose) {
      logger.info(`\n=== Final Result (${state.status}) ===`);
      logger.info(result);
    }

    return result;
  }

  // Get agent state for a task
  async getState(taskId: string): Promise<AgentState | null> {
    if (!this.database) return null;

    const message = await this.database.getDailyWork(this.userId, new Date());
    if (message?.id !== taskId) return null;

    try {
      const data = JSON.parse(message.content);
      return {
        taskId,
        userId: this.userId,
        status: data.status,
        currentPlan: data.plan || [],
        iteration: data.iteration || 0,
        result: data.result,
        error: data.error,
        createdAt: message.date,
        updatedAt: message.date,
      };
    } catch {
      return null;
    }
  }
}
