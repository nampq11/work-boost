import type { ParsedDebtEntry } from '../entity/debt.ts';
import type { BrainRunResult, Capability, Context, Message } from '../brain/types.ts';
import type { StreamResult } from '../brain/streaming/types.ts';

export type AgentPlatform = 'api' | 'slack' | 'telegram';

export interface AgentStreamChunk {
  content: string;
  isFinal: boolean;
}

export interface AgentRunOptions {
  sessionId?: string;
  capability?: string;
  verbose?: boolean;
}

export interface AgentStreamOptions {
  sessionId?: string;
  platform?: AgentPlatform;
  chatId?: string;
}

export interface AgentPort {
  run(message: string, options?: AgentRunOptions): Promise<BrainRunResult>;
  stream(
    message: string,
    onChunk: (chunk: AgentStreamChunk) => void | Promise<void>,
    options?: AgentStreamOptions,
  ): Promise<StreamResult>;
  parseDebtEntry(input: string): Promise<ParsedDebtEntry | null>;

  createSession(sessionId?: string): Promise<string>;
  loadSession(sessionId: string): Promise<Context>;
  removeSession(sessionId: string): Promise<boolean>;
  listSessions(): string[];
  getSessionMessages(sessionId: string): Message[];
  clearSession(sessionId: string): void;

  getCapabilities(): Capability[];
  getCapability(id: string): Capability | undefined;
}
