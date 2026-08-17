export type MessagePlatform = 'slack' | 'telegram';
export type MessageParseMode = 'HTML' | 'Markdown' | 'None';

export interface MessageButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface SendMessageOptions {
  parseMode?: MessageParseMode;
  keyboard?: unknown;
}

export interface MessageSender {
  readonly platform?: MessagePlatform;
  sendMessage(chatId: string, content: string, options?: SendMessageOptions): Promise<void>;
}
