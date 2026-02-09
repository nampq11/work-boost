import { GoogleGenAI } from '@google/genai';
import { logger } from '../../logger/logger.ts';

// Tool definitions
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

// Bash tool
export class BashTool implements Tool {
  name = 'bash';
  description = 'Execute bash commands. Use for running shell commands, scripts, and operations on the filesystem.';

  async execute(args: string): Promise<ToolResult> {
    try {
      const command = new Deno.Command('sh', {
        args: ['-c', args],
        stdout: 'piped',
        stderr: 'piped',
      });

      const { stdout, stderr, code } = await command.output();

      if (code === 0) {
        return {
          success: true,
          output: new TextDecoder().decode(stdout),
        };
      } else {
        return {
          success: false,
          output: new TextDecoder().decode(stdout),
          error: new TextDecoder().decode(stderr),
        };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Edit tool
export class EditTool implements Tool {
  name = 'edit';
  description = 'Edit files in the codebase. Provide file path and new content.';

  async execute(args: string): Promise<ToolResult> {
    try {
      const match = args.match(/^(\S+)\s*\n(.*)$/s);
      if (!match) {
        return {
          success: false,
          output: '',
          error: 'Invalid format. Use: edit <filepath>\\n<content>',
        };
      }

      const [, filepath, content] = match;
      const fullPath = filepath.startsWith('/') ? filepath : `/${filepath}`;

      await Deno.writeTextFile(fullPath, content);

      return {
        success: true,
        output: `Successfully edited ${filepath}`,
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

// Loop Agent
export class LoopAgent {
  private ai: GoogleGenAI;
  private tools: Map<string, Tool>;
  private maxIterations: number;
  private systemPrompt: string;

  constructor(apiKey: string, options?: { maxIterations?: number }) {
    this.ai = new GoogleGenAI({ apiKey });
    this.tools = new Map();
    this.maxIterations = options?.maxIterations ?? 10;
    this.systemPrompt = this.getSystemPrompt();

    // Register default tools
    this.registerTool(new BashTool());
    this.registerTool(new EditTool());
  }

  private getSystemPrompt(): string {
    const toolDescriptions = Array.from(this.tools.values())
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `You are an autonomous AI agent that can execute tasks by planning and using tools.

Available tools:
${toolDescriptions}

When you need to use a tool, respond with a JSON object in this format:
{
  "thought": "your reasoning about what to do next",
  "tool": "tool_name or 'done' if task is complete",
  "args": "arguments for the tool (command, file path, etc.)"
}

Rules:
1. Start by analyzing the task and creating a plan
2. Execute one tool at a time
3. Review the output and decide the next action
4. Continue until the task is complete, then set tool to "done"
5. Always provide your thought process before choosing a tool
6. For bash commands, be precise and careful with destructive operations
7. For edit operations, provide the full file path and complete new content`;
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  async run(task: string, verbose = true): Promise<string> {
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
              tool: { type: 'string' },
              args: { type: 'string' },
            },
            required: ['thought', 'tool', 'args'],
          },
        },
      });

      if (!response.text) {
        result = 'Error: No response from AI';
        break;
      }

      let action;
      try {
        action = JSON.parse(response.text);
      } catch {
        result = `Error: Invalid JSON response: ${response.text}`;
        break;
      }

      if (verbose) {
        logger.info(`Thought: ${action.thought}`);
        logger.info(`Tool: ${action.tool}`);
      }

      // Check if done
      if (action.tool === 'done') {
        result = action.thought || 'Task completed';
        break;
      }

      // Execute tool
      const tool = this.tools.get(action.tool);
      if (!tool) {
        const error = `Unknown tool: ${action.tool}`;
        logger.error(error);
        messages.push({
          role: 'user' as const,
          parts: [{ text: `Tool execution failed: ${error}` }],
        });
        continue;
      }

      const toolResult = await tool.execute(action.args);

      if (verbose) {
        if (toolResult.success) {
          logger.info(`Output: ${toolResult.output.slice(0, 200)}...`);
        } else {
          logger.error(`Error: ${toolResult.error}`);
        }
      }

      // Add result to conversation
      const resultText = toolResult.success
        ? `Tool "${action.tool}" executed successfully.\nOutput:\n${toolResult.output}`
        : `Tool "${action.tool}" failed.\nError: ${toolResult.error}`;

      messages.push({
        role: 'model' as const,
        parts: [{ text: response.text }],
      });
      messages.push({
        role: 'user' as const,
        parts: [{ text: resultText }],
      });

      // Add a brief delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (iteration >= this.maxIterations) {
      result = 'Maximum iterations reached. Task may not be complete.';
    }

    return result;
  }
}
