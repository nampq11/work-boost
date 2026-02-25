/**
 * Planning Layer
 *
 * Analyzes what to do before executing.
 * Provides transparency by showing the plan to the user,
 * then executes step-by-step with progress updates.
 */

import type { GoogleGenAI } from '@google/genai';
import { logger } from '../../logger/logger.ts';
import type { LangfuseService } from '../../observability/langfuse/langfuse.ts';
import type { Tool } from '../types.ts';
import { PLAN_SYSTEM_PROMPT, planSchema } from '../prompts/planning/index.ts';
import {
  type Plan,
  type PlanOptions,
  type PlanProgress,
  type PlanResult,
  StepStatus,
  PlanStatus,
} from './types.ts';

/**
 * The Planner - creates and executes plans
 *
 * Following agent-builder philosophy:
 * > Start simple. Add complexity only when real usage reveals the need.
 *
 * Most agents don't need planning. Add this when:
 * - Multi-step tasks lose coherence
 * - Users need visibility into what will happen
 * - Complex workflows need transparency
 */
export class Planner {
  private ai: GoogleGenAI;
  private langfuse?: LangfuseService | null;
  private activePlans: Map<string, Plan>;

  constructor(ai: GoogleGenAI, langfuse?: LangfuseService | null) {
    this.ai = ai;
    this.langfuse = langfuse;
    this.activePlans = new Map();
  }

  /**
   * Create a plan from a user request
   *
   * The LLM analyzes the request and breaks it down into steps.
   */
  async createPlan(
    userRequest: string,
    sessionId: string,
    availableTools: Tool[],
    options: PlanOptions = {},
  ): Promise<PlanResult> {
    const { maxSteps = 10 } = options;

    // Create trace for planning
    const trace = this.langfuse?.isEnabled()
      ? this.langfuse.createTrace({
        name: 'planning',
        input: { userRequest, sessionId, toolCount: availableTools.length },
        metadata: { phase: 'create_plan' },
      })
      : null;

    const generation = trace?.generation({
      name: 'plan_generation',
      model: 'gemini-2.5-flash',
      startTime: Date.now(),
    });

    try {
      // Build system prompt with available tools
      const toolDescriptions = availableTools
        .map((t) => `- ${t.name}: ${t.description}`)
        .join('\n');

      const systemPrompt = PLAN_SYSTEM_PROMPT([toolDescriptions], maxSteps);

      // Generate plan
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: systemPrompt + '\n\nUser request: ' + userRequest }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: planSchema,
        },
      });

      if (!response.text) {
        generation?.update({ output: { error: 'No response from AI' } });
        generation?.end();
        trace?.end();
        return {
          success: false,
          error: 'Failed to generate plan: No response from AI',
        };
      }

      // Parse plan
      const planData = JSON.parse(response.text);

      const plan: Plan = {
        id: crypto.randomUUID(),
        sessionId,
        userRequest,
        summary: planData.summary,
        steps: planData.steps.map((step: unknown, index: number) => ({
          step: index + 1,
          description: (step as Record<string, unknown>).description as string,
          action: (step as Record<string, unknown>).action as string,
          parameters: (step as Record<string, unknown>).parameters as Record<string, unknown>,
          expectedOutcome: (step as Record<string, unknown>).expectedOutcome as string | undefined,
          status: StepStatus.PENDING,
        })),
        status: PlanStatus.DRAFT,
        createdAt: new Date(),
        estimatedDuration: planData.estimatedDuration as number | undefined,
      };

      generation?.update({
        output: response.text,
        usageDetails: {
          totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
          promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
      });
      generation?.end();
      trace?.end();

      logger.info('Plan created', {
        planId: plan.id,
        sessionId,
        stepCount: plan.steps.length,
        summary: plan.summary,
      });

      return { success: true, plan };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      generation?.update({
        output: { error: errorMessage },
        metadata: { error: errorMessage },
      });
      generation?.end();
      trace?.end();

      logger.error('Failed to create plan', { error: errorMessage, userRequest });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Store a plan for tracking
   */
  storePlan(plan: Plan): void {
    this.activePlans.set(plan.id, plan);
  }

  /**
   * Get a plan by ID
   */
  getPlan(planId: string): Plan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Update a step's status
   */
  updateStep(
    planId: string,
    stepNumber: number,
    status: StepStatus,
    result?: unknown,
    error?: string,
  ): Plan | undefined {
    const plan = this.activePlans.get(planId);
    if (!plan) return undefined;

    const step = plan.steps[stepNumber - 1];
    if (step) {
      step.status = status;
      step.result = result;
      step.error = error;
    }

    return plan;
  }

  /**
   * Format a plan for display to user
   */
  formatPlan(plan: Plan): string {
    const lines = [
      `📋 Plan: ${plan.summary}`,
      '',
      'Steps:',
      ...plan.steps.map((s) => {
        const icon = this.statusIcon(s.status);
        return `  ${icon} Step ${s.step}: ${s.description}`;
      }),
    ];

    if (plan.estimatedDuration) {
      const seconds = Math.round(plan.estimatedDuration / 1000);
      lines.push(``, `⏱️  Estimated time: ${seconds}s`);
    }

    return lines.join('\n');
  }

  /**
   * Format plan progress for display
   */
  formatProgress(progress: PlanProgress): string {
    const percent = Math.round((progress.step / progress.totalSteps) * 100);
    const icon = this.statusIcon(progress.status);
    return `${icon} [${percent}%] Step ${progress.step}/${progress.totalSteps}: ${progress.description}`;
  }

  /**
   * Get emoji for step status
   */
  private statusIcon(status: StepStatus): string {
    switch (status) {
      case StepStatus.PENDING:
        return '⏳';
      case StepStatus.IN_PROGRESS:
        return '▶️';
      case StepStatus.COMPLETED:
        return '✅';
      case StepStatus.FAILED:
        return '❌';
      case StepStatus.SKIPPED:
        return '⏭️';
      default:
        return '❓';
    }
  }

  /**
   * Clean up old plans
   */
  cleanup(maxAge = 60 * 60 * 1000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, plan] of this.activePlans) {
      const age = now - plan.createdAt.getTime();
      if (age > maxAge) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.activePlans.delete(id);
    }

    if (toDelete.length > 0) {
      logger.debug(`Cleaned up ${toDelete.length} old plan(s)`);
    }
  }
}

/**
 * Create a planner instance
 */
export function createPlanner(
  ai: GoogleGenAI,
  langfuse?: LangfuseService | null,
): Planner {
  return new Planner(ai, langfuse);
}
