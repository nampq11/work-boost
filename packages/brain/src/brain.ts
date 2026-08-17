/**
 * Brain - The Core Agent Loop
 *
 * Following the agent-builder philosophy:
 * > The model already knows how to be an agent.
 * > Your job is to get out of the way.
 *
 * The brain is a simple loop:
 * LOOP:
 *   Model sees: context + available capabilities
 *   Model decides: act or respond
 *   If act: execute capability, add result, continue
 *   If respond: return to user
 *
 * The magic isn't in the code - it's in the model.
 * This code just provides the opportunity.
 */

import { GoogleGenAI } from '@google/genai';
import type { Database } from '@work-boost/data-provider';
import type { DailyWorkReport } from '@work-boost/data-schemas/agent.ts';
import type { ParsedDebtEntry } from '@work-boost/data-schemas/debt.ts';
import { logger } from '@work-boost/shared/logger/logger.ts';
import type { LangfuseService } from '@work-boost/shared/observability/langfuse/langfuse.ts';
import { getAllCapabilities } from './capabilities.ts';
import { ContextManager } from './context.ts';
import { LongTermMemory, MemoryType, WorkingMemory } from './memory/index.ts';
import { PlanStatus, Planner, StepStatus, createPlanner } from './planning/index.ts';
import type { AgentPlatform, AgentPort } from './ports/agent.ts';
import type { MessageSender } from './ports/messaging.ts';
import { Streamer, createChunkSender, createStreamer } from './streaming/index.ts';
import { executeToolCall, getAllTools } from './tools/index.ts';
import type { BrainConfig, BrainRunResult, Capability, Context, Message, Tool } from './types.ts';

/**
 * The Brain class - core agent loop
 *
 * Trust the model. Don't over-engineer. Don't pre-specify workflows.
 * Give it capabilities and let it reason.
 */
export class Brain implements AgentPort {
  private static instance: Brain;
  private ai: GoogleGenAI;
  private config: BrainConfig;
  private contextManager: ContextManager;
  private capabilities: Capability[];
  private tools: Tool[];
  private slack?: MessageSender | null;
  private telegram?: MessageSender | null;
  private langfuse?: LangfuseService | null;

  // Enhanced agent features
  private planner: Planner;
  private streamer: Streamer;
  private workingMemory: WorkingMemory;
  private longTermMemory?: LongTermMemory;
  private db?: Database;

  private constructor(
    config: BrainConfig,
    slack?: MessageSender | null,
    telegram?: MessageSender | null,
    langfuse?: LangfuseService | null,
    db?: Database,
  ) {
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    this.config = config;
    this.contextManager = new ContextManager(config.sessionTTL);
    this.capabilities = getAllCapabilities(this.ai, langfuse);
    this.slack = slack;
    this.telegram = telegram;
    this.langfuse = langfuse;
    this.db = db;

    // Initialize tools with database tools if db is available
    this.tools = getAllTools(slack ?? null, telegram ?? null, langfuse, db);

    // Initialize enhanced features
    this.planner = createPlanner(this.ai, langfuse);
    this.streamer = createStreamer(this.ai, langfuse);
    this.workingMemory = new WorkingMemory();

    if (db) {
      this.longTermMemory = new LongTermMemory(db.kv, this.ai, langfuse);
    }
  }

  /**
   * Initialize the brain singleton
   */
  static async init(
    config: BrainConfig,
    slack?: MessageSender | null,
    telegram?: MessageSender | null,
    langfuse?: LangfuseService | null,
    db?: Database,
  ): Promise<Brain> {
    if (this.instance) {
      // Update services if provided
      if (slack !== undefined || telegram !== undefined || langfuse !== undefined) {
        this.instance.slack = slack;
        this.instance.telegram = telegram;
        this.instance.langfuse = langfuse;
        this.instance.tools = getAllTools(slack ?? null, telegram ?? null, langfuse, db);
        this.instance.capabilities = getAllCapabilities(this.instance.ai, langfuse);
      }
      return this.instance;
    }

    this.instance = new Brain(config, slack, telegram, langfuse, db);
    return this.instance;
  }

  /**
   * Get the brain instance
   */
  static getInstance(): Brain | undefined {
    return this.instance;
  }

  /**
   * Run the brain with a message
   *
   * The core loop: see context + capabilities, decide, act/respond
   */
  async run(
    message: string,
    options: {
      sessionId?: string;
      capability?: string;
      verbose?: boolean;
    } = {},
  ): Promise<BrainRunResult> {
    const { sessionId = 'default', capability, verbose = false } = options;

    // Add user message to context
    this.contextManager.addMessage(sessionId, {
      role: 'user',
      content: message,
    });

    let response: string;

    // If a specific capability is requested, use it
    if (capability) {
      const cap = this.capabilities.find((c) => c.id === capability);
      if (cap) {
        const result = await cap.execute({ input: message, verbose });

        if (result.success && result.data) {
          response = this.formatCapabilityResult(cap.id, result.data);
        } else {
          response = `Error: ${result.error}`;
        }
      } else {
        response = `Unknown capability: ${capability}`;
      }
    } else {
      // Default to chat capability for general conversation
      const cap = this.capabilities.find((c) => c.id === 'chat');
      if (cap) {
        const result = await cap.execute({ input: message, verbose });

        if (result.success && result.data) {
          response = this.formatCapabilityResult(cap.id, result.data);
        } else {
          response = `Error: ${result.error}`;
        }
      } else {
        response = 'No capabilities available';
      }
    }

    // Add response to context
    this.contextManager.addMessage(sessionId, {
      role: 'model',
      content: response,
    });

    return { response };
  }

  /**
   * Execute a specific capability directly
   */
  async executeCapability(
    capabilityId: string,
    input: Record<string, unknown>,
    options: { verbose?: boolean } = {},
  ): Promise<BrainRunResult> {
    const { verbose = false } = options;
    const cap = this.capabilities.find((c) => c.id === capabilityId);

    if (!cap) {
      return {
        response: `Unknown capability: ${capabilityId}`,
      };
    }

    const result = await cap.execute({ ...input, verbose });

    if (result.success && result.data) {
      const response = this.formatCapabilityResult(capabilityId, result.data);
      return { response };
    }

    return {
      response: `Error executing ${capabilityId}: ${result.error}`,
    };
  }

  /**
   * Format capability result for display
   */
  private formatCapabilityResult(capabilityId: string, data: unknown): string {
    switch (capabilityId) {
      case 'chat': {
        // Chat returns plain text, return as-is
        return typeof data === 'string' ? data : String(data);
      }
      case 'daily-work-report': {
        const report = data as DailyWorkReport;
        return this.formatDailyWorkReport(report);
      }
      case 'parse-debt-entry': {
        const debt = data as ParsedDebtEntry;
        return this.formatDebtEntry(debt);
      }
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * Format daily work report for Slack/Telegram
   */
  private formatDailyWorkReport(report: DailyWorkReport): string {
    const formatTasks = (tasks: Array<{ project: string; task: string }>) => {
      if (tasks.length === 0) return ' •  N/A';
      return tasks
        .map((t) => {
          return ` •  ${t.project}: ${t.task}`;
        })
        .join('\n');
    };

    return `1. Việc hoàn thành hôm trước?
${formatTasks(report.completed)}
2. Việc dự định làm hôm trước nhưng không hoàn thành?
${formatTasks(report.incomplete)}
3. Việc dự định làm hôm nay?
${formatTasks(report.planned)}`;
  }

  /**
   * Format debt entry for display
   */
  private formatDebtEntry(debt: ParsedDebtEntry): string {
    const direction = debt.direction === 'lent' ? 'Cho vay' : 'Đi vay';
    const reason = debt.reason ? ` (lý do: ${debt.reason})` : '';
    return `${direction}: ${debt.amount} ${debt.currency} ${debt.person}${reason}`;
  }

  async parseDebtEntry(input: string): Promise<ParsedDebtEntry | null> {
    const cap = this.capabilities.find((c) => c.id === 'parse-debt-entry');
    if (!cap) return null;

    const result = await cap.execute({ input });
    if (!result.success || !result.data) return null;

    return result.data as ParsedDebtEntry;
  }

  /**
   * Session management methods
   */
  async createSession(sessionId?: string): Promise<string> {
    // Generate a unique ID using timestamp and random
    const generateId = (): string => {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 11);
      return `${timestamp}-${random}`;
    };

    const id = sessionId || generateId();
    this.contextManager.getOrCreateContext(id);
    return id;
  }

  async loadSession(sessionId: string): Promise<Context> {
    return this.contextManager.getOrCreateContext(sessionId);
  }

  async removeSession(sessionId: string): Promise<boolean> {
    return this.contextManager.removeContext(sessionId);
  }

  listSessions(): string[] {
    return this.contextManager.listSessions();
  }

  getSessionMessages(sessionId: string): Message[] {
    return this.contextManager.getMessages(sessionId);
  }

  clearSession(sessionId: string): void {
    this.contextManager.clearContext(sessionId);
  }

  /**
   * Get available capabilities
   */
  getCapabilities(): Capability[] {
    return [...this.capabilities];
  }

  /**
   * Get capability by ID
   */
  getCapability(id: string): Capability | undefined {
    return this.capabilities.find((c) => c.id === id);
  }

  /**
   * Get available tools
   */
  getTools(): Tool[] {
    return [...this.tools];
  }

  /**
   * Run the brain with a message using tool calling
   *
   * The agent loop with tools:
   * LOOP:
   *   Model sees: message + available tools
   *   Model decides: call tool or respond
   *   If call tool: execute, add result, continue
   *   If respond: return to user
   */
  async runWithTools(
    message: string,
    options: {
      sessionId?: string;
      platform?: AgentPlatform;
      chatId?: string;
      tools?: Tool[];
      verbose?: boolean;
    } = {},
  ): Promise<BrainRunResult> {
    const {
      sessionId = 'default',
      platform,
      chatId,
      tools = this.tools,
      verbose = false,
    } = options;

    // Add user message to context
    this.contextManager.addMessage(sessionId, {
      role: 'user',
      content: message,
    });

    // Get context messages
    const contextMessages = this.contextManager.getMessages(sessionId);

    // Build system prompt with available tools
    const toolDescriptions = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
    const systemPrompt = `You are a helpful assistant for Work Boost bot.

Available tools:
${toolDescriptions}

When you need to send a message to the user, use the send_message tool.
When you need to format data for display, use the format_* tools first, then send the result.

Current context:
- Platform: ${platform || 'unknown'}
- Chat ID: ${chatId || 'unknown'}

User message: ${message}`;

    // Build contents for Gemini
    const contents = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
    ];

    // Add conversation history
    for (const msg of contextMessages) {
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Generate with tools
    const response = await this.ai.models.generateContent({
      model: this.config.model || 'gemini-2.5-flash',
      contents,
      // @ts-ignore - Gemini tool calling API
      tools: tools.map((t) => ({
        functionDeclarations: [
          {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        ],
      })),
    });

    if (verbose) {
      logger.debug('Brain response', { response: response.text });
      logger.debug('Function calls', { calls: response.functionCalls });
    }

    // Handle function calls
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const toolResults: unknown[] = [];
      const toolCallsList: { id: string; name: string; parameters: Record<string, unknown> }[] = [];

      for (const call of functionCalls) {
        const { name, args } = call;
        if (!name) continue;

        toolCallsList.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          name,
          parameters: args as Record<string, unknown>,
        });

        // Execute tool
        const result = await executeToolCall(tools, {
          name,
          parameters: args as Record<string, unknown>,
        });
        toolResults.push(result);

        if (verbose) {
          logger.debug(`Tool ${name} result`, { result });
        }
      }

      // Add tool results to context and get final response
      const toolResultsText = toolResults
        .map((r, i) => `Tool ${functionCalls[i]?.name}: ${JSON.stringify(r)}`)
        .join('\n');

      this.contextManager.addMessage(sessionId, {
        role: 'model',
        content: `[Used tools: ${toolCallsList.map((t) => t.name).join(', ')}]\n${toolResultsText}`,
      });

      return {
        response: toolResultsText,
        toolCalls: toolCallsList,
      };
    }

    // No tool calls, return text response
    const text = response.text || 'No response from AI';
    this.contextManager.addMessage(sessionId, {
      role: 'model',
      content: text,
    });

    return { response: text };
  }

  /**
   * Execute a tool directly by name
   */
  async executeTool(toolName: string, parameters: Record<string, unknown>): Promise<unknown> {
    const result = await executeToolCall(this.tools, { name: toolName, parameters });
    return result;
  }

  /**
   * Create a plan for a user request
   *
   * The planning layer analyzes what to do before executing.
   * Provides transparency by showing the plan to the user.
   */
  async createPlan(
    userRequest: string,
    sessionId: string,
    options: {
      maxSteps?: number;
      requireApproval?: boolean;
    } = {},
  ) {
    const planResult = await this.planner.createPlan(userRequest, sessionId, this.tools, options);

    if (planResult.success && planResult.plan) {
      this.planner.storePlan(planResult.plan);
    }

    return planResult;
  }

  /**
   * Execute a plan step by step
   *
   * Runs through plan steps with progress updates.
   */
  async executePlan(
    planId: string,
    onProgress?: (progress: {
      step: number;
      total: number;
      description: string;
      status: string;
    }) => void,
  ) {
    const plan = this.planner.getPlan(planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }

    plan.status = PlanStatus.IN_PROGRESS;
    plan.startedAt = new Date();

    const results: unknown[] = [];

    for (const step of plan.steps) {
      step.status = StepStatus.IN_PROGRESS;
      onProgress?.({
        step: step.step,
        total: plan.steps.length,
        description: step.description,
        status: step.status,
      });

      try {
        // Execute the step using the appropriate tool
        const tool = this.tools.find((t) => t.name === step.action);
        if (tool) {
          const result = await tool.execute(step.parameters || {});
          step.result = result;
          results.push(result);
          step.status = StepStatus.COMPLETED;
        } else {
          step.status = StepStatus.FAILED;
          step.error = `Tool not found: ${step.action}`;
        }
      } catch (error) {
        step.status = StepStatus.FAILED;
        step.error = error instanceof Error ? error.message : 'Unknown error';
      }

      onProgress?.({
        step: step.step,
        total: plan.steps.length,
        description: step.description,
        status: step.status,
      });
    }

    plan.status = PlanStatus.COMPLETED;
    plan.completedAt = new Date();
    plan.actualDuration = plan.completedAt.getTime() - plan.startedAt!.getTime();

    return {
      success: true,
      plan,
      results,
    };
  }

  /**
   * Stream a response to the user
   *
   * Sends partial responses as they arrive from the LLM.
   * Provides better UX for long-running responses.
   */
  async stream(
    message: string,
    onChunk: (chunk: { content: string; isFinal: boolean }) => void | Promise<void>,
    options: {
      sessionId?: string;
      platform?: AgentPlatform;
      chatId?: string;
    } = {},
  ) {
    const { sessionId = 'default', platform, chatId } = options;

    // Add user message to context
    this.contextManager.addMessage(sessionId, {
      role: 'user',
      content: message,
    });

    // Get context messages
    const contextMessages = this.contextManager.getMessages(sessionId);

    // Build messages for streaming
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a helpful assistant for Work Boost bot.
Platform: ${platform || 'unknown'}
Chat ID: ${chatId || 'unknown'}

Provide concise, helpful responses.`,
        timestamp: new Date(),
      },
      ...contextMessages,
    ];

    // Stream the response
    const result = await this.streamer.stream(messages, this.tools, {
      onChunk: async (chunk) => {
        await onChunk({ content: chunk.content, isFinal: chunk.isFinal });
      },
    });

    // Add final accumulated content to context
    if (result.success && result.content) {
      this.contextManager.addMessage(sessionId, {
        role: 'model',
        content: result.content,
      });
    }

    return result;
  }

  /**
   * Store a memory in long-term memory
   *
   * Stores knowledge that persists across sessions.
   */
  async storeMemory(
    userId: string,
    type: MemoryType,
    content: string,
    metadata: Record<string, unknown> = {},
    options: { importance?: number; ttl?: number } = {},
  ) {
    if (!this.longTermMemory) {
      return { success: false, error: 'Long-term memory not available' };
    }

    const id = await this.longTermMemory.store(
      {
        userId,
        type,
        content,
        metadata,
        importance: options.importance ?? 0.5,
      },
      { ttl: options.ttl },
    );

    return { success: true, id };
  }

  /**
   * Retrieve relevant memories
   *
   * Loads memories relevant to a query from long-term storage.
   */
  async retrieveMemories(
    userId: string,
    query: string,
    options: { maxResults?: number; minScore?: number; types?: MemoryType[] } = {},
  ) {
    if (!this.longTermMemory) {
      return { success: false, error: 'Long-term memory not available', memories: [] };
    }

    const memories = await this.longTermMemory.retrieve(query, userId, options);

    return {
      success: true,
      memories,
      count: memories.length,
    };
  }

  /**
   * Set working memory goal
   *
   * Sets the current goal for a session.
   */
  setWorkingGoal(sessionId: string, goal: string): void {
    this.workingMemory.setGoal(sessionId, goal);
  }

  /**
   * Get working memory goal
   *
   * Gets the current goal for a session.
   */
  getWorkingGoal(sessionId: string): string | undefined {
    return this.workingMemory.getGoal(sessionId);
  }

  /**
   * Store entity in working memory
   *
   * Stores an important entity for the current session.
   */
  setWorkingEntity(sessionId: string, key: string, value: unknown): void {
    this.workingMemory.setEntity(sessionId, key, value);
  }

  /**
   * Get entity from working memory
   *
   * Retrieves an entity from the current session.
   */
  getWorkingEntity(sessionId: string, key: string): unknown | undefined {
    return this.workingMemory.getEntity(sessionId, key);
  }

  /**
   * Clear working memory for a session
   *
   * Clears all working memory for a session.
   */
  clearWorkingMemory(sessionId: string): void {
    this.workingMemory.clear(sessionId);
  }

  /**
   * Get the planner instance
   */
  getPlanner(): Planner {
    return this.planner;
  }

  /**
   * Get the streamer instance
   */
  getStreamer(): Streamer {
    return this.streamer;
  }

  /**
   * Get the long-term memory instance
   */
  getLongTermMemory(): LongTermMemory | undefined {
    return this.longTermMemory;
  }

  /**
   * Get the working memory instance
   */
  getWorkingMemory(): WorkingMemory {
    return this.workingMemory;
  }
}

/**
 * Convenience function to initialize and get the brain
 */
export async function initBrain(
  apiKey: string,
  options?: {
    model?: string;
    slack?: MessageSender | null;
    telegram?: MessageSender | null;
    langfuse?: LangfuseService | null;
    db?: Database;
  },
): Promise<Brain> {
  return Brain.init(
    {
      model: options?.model ?? 'gemini-2.5-flash',
      apiKey,
    },
    options?.slack,
    options?.telegram,
    options?.langfuse,
    options?.db,
  );
}
