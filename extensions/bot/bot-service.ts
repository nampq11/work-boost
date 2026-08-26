import type { Platform as EntityPlatform } from '@work-boost/data-schemas/subscription.ts';

// Re-export Platform from entity for convenience
export type Platform = EntityPlatform;

export interface BotService {
  readonly platform: Platform;

  // Send a formatted message to a user
  sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;
}

export interface SendOptions {
  parseMode?: 'HTML' | 'Markdown' | 'None';
  keyboard?: unknown;
}

export interface KeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}
