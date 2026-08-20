import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Message } from '@work-boost/data-schemas';
import type { Context } from 'grammy';
import { splitMessage } from '../../formatters/telegram-formatter.ts';

interface MessageHandlerDeps {
  db: Database;
  agent: AgentPort;
}
/**
 * Handle work report messages from users.
 * Delegates natural-language processing to the Brain agent.
 */
export async function handleMessage(ctx: Context, deps: MessageHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id?.toString();
  const fromId = ctx.from?.id.toString();
  const text = ctx.message?.text;

  if (!chatId || !fromId || !text) {
    return;
  }

  // Store the message
  const message: Message = {
    id: crypto.randomUUID(),
    userId: fromId,
    content: text,
    date: new Date(),
  };
  await deps.db.storeDailyWorkMessage(message);

  try {
    const sessionId = `telegram_${fromId}`;
    const response = await deps.agent.stream(text, { sessionId });

    if (response) {
      const parts = splitMessage(response);
      for (const part of parts) {
        try {
          await ctx.api.sendMessage(chatId, part, { parse_mode: 'HTML' });
        } catch {
          await ctx.api.sendMessage(chatId, part);
        }
      }
    }
  } catch (error) {
    await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    console.error('Error processing message:', error);
  }
}
