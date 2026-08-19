import type { AgentPort } from '@work-boost/brain';
import type { DataLayer, Database } from '@work-boost/data-provider';
import type { Logger } from '@work-boost/shared';
import type { SendOptions } from './bot/bot-service.ts';

export interface ExtensionMessageSender {
  sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;
}

export interface ExtensionMessaging {
  slack?: ExtensionMessageSender;
  telegram?: ExtensionMessageSender;
}

export interface ExtensionContext {
  dataLayer: DataLayer;
  db: Database;
  agent: AgentPort;
  logger: Logger;
  env: {
    get(key: string): string | undefined;
  };
  messaging?: ExtensionMessaging;
}

export type ExtensionHandler = (req: Request) => Promise<Response>;

export interface ExtensionRouter {
  get(path: string, handler: ExtensionHandler): void;
  post(path: string, handler: ExtensionHandler): void;
  put(path: string, handler: ExtensionHandler): void;
  delete(path: string, handler: ExtensionHandler): void;
}

export interface ExtensionCronJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
}

export interface WorkBoostExtension {
  readonly name: string;
  readonly version?: string;
  init(ctx: ExtensionContext): Promise<void> | void;
  registerRoutes?(router: ExtensionRouter): void;
  registerJobs?(): ExtensionCronJob[];
  dispose?(): Promise<void> | void;
}

export function isWorkBoostExtension(value: unknown): value is WorkBoostExtension {
  if (!value || typeof value !== 'object') return false;

  const extension = value as Partial<WorkBoostExtension>;
  return (
    typeof extension.name === 'string' &&
    extension.name.length > 0 &&
    typeof extension.init === 'function' &&
    (extension.registerRoutes === undefined || typeof extension.registerRoutes === 'function') &&
    (extension.registerJobs === undefined || typeof extension.registerJobs === 'function') &&
    (extension.dispose === undefined || typeof extension.dispose === 'function')
  );
}
