/**
 * Planning Layer Types
 *
 * The planning layer analyzes what to do before executing.
 * It provides transparency by showing the plan to the user,
 * then executes step-by-step with progress updates.
 */

/**
 * A single step in a plan
 */
export interface PlanStep {
  /** Step number (1-indexed) */
  step: number;

  /** Description of what this step does */
  description: string;

  /** Tool or capability to use */
  action: string;

  /** Parameters for the action */
  parameters?: Record<string, unknown>;

  /** Expected outcome */
  expectedOutcome?: string;

  /** Current status */
  status: StepStatus;

  /** Error message if failed */
  error?: string;

  /** Result of executing this step */
  result?: unknown;
}

/**
 * Status of a plan step
 */
export enum StepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * A plan - sequence of steps to accomplish a goal
 */
export interface Plan {
  /** Unique plan ID */
  id: string;

  /** Session this plan belongs to */
  sessionId: string;

  /** User's original request */
  userRequest: string;

  /** Brief summary of what the plan does */
  summary: string;

  /** Steps to execute */
  steps: PlanStep[];

  /** Current status of the plan */
  status: PlanStatus;

  /** When the plan was created */
  createdAt: Date;

  /** When the plan started executing */
  startedAt?: Date;

  /** When the plan completed */
  completedAt?: Date;

  /** Total estimated time (ms) */
  estimatedDuration?: number;

  /** Actual time taken (ms) */
  actualDuration?: number;
}

/**
 * Overall status of a plan
 */
export enum PlanStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Result of plan creation
 */
export interface PlanResult {
  success: boolean;
  plan?: Plan;
  error?: string;
}

/**
 * Progress update during plan execution
 */
export interface PlanProgress {
  planId: string;
  step: number;
  totalSteps: number;
  status: StepStatus;
  description: string;
  result?: unknown;
}

/**
 * Options for plan generation
 *
 * Only options honored by the implementation are exposed; approval, step
 * timeout, and duration controls were previously declared but never enforced.
 */
export interface PlanOptions {
  /** Maximum number of steps */
  maxSteps?: number;
}
