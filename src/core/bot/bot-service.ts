export type Platform = 'slack' | 'telegram';

export interface BotUpdate {
  platform: Platform;
  userId: string;
  chatId: string;
  action: 'subscribe' | 'unsubscribe' | 'status' | 'message' | 'start';
  data?: Record<string, unknown>;
}

export interface BotService {
  readonly platform: Platform;

  // Send a formatted message to a user
  sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;

  // Validate incoming webhook request (native Web Request)
  validateWebhook(request: Request): Promise<boolean>;

  // Handle webhook and return response (native Web Request/Response)
  handleWebhook(request: Request): Promise<Response>;
}

export interface SendOptions {
  parseMode?: 'HTML' | 'Markdown' | 'None';
  keyboard?: KeyboardButton[][];
}

export interface KeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}
