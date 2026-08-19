import type { ParsedDebtEntry } from '@work-boost/data-schemas/debt.ts';

export type AgentPlatform = 'api' | 'slack' | 'telegram';

export interface AgentStreamChunk {
  content: string;
  isFinal: boolean;
}

export interface AgentStreamResult {
  /** Complete accumulated content */
  content: string;
  /** Number of chunks sent */
  chunksSent: number;
  /** Whether the stream completed successfully */
  success: boolean;
  /** Error if the stream failed */
  error?: string;
  /** Duration of the stream (ms) */
  duration: number;
}

export interface AgentStreamOptions {
  sessionId?: string;
  platform?: AgentPlatform;
  chatId?: string;
}

export interface DailyWorkReportResult {
  success: boolean;
  /** The formatted report (Vietnamese), present when success is true */
  content?: string;
  error?: string;
}

export interface AgentPort {
  stream(
    message: string,
    onChunk: (chunk: AgentStreamChunk) => void | Promise<void>,
    options?: AgentStreamOptions,
  ): Promise<AgentStreamResult>;
  parseDebtEntry(input: string): Promise<ParsedDebtEntry | null>;
  generateDailyWorkReport(content: string): Promise<DailyWorkReportResult>;

  createSession(sessionId?: string): Promise<string>;
  loadSession(sessionId: string): Promise<void>;
  removeSession(sessionId: string): Promise<boolean>;
  /** Stop background timers (session cleanup). Intended for tests and shutdown. */
  dispose(): void;
}
