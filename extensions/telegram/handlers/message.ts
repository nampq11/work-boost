import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Message } from '@work-boost/data-schemas';
import type { Context } from 'grammy';

interface MessageHandlerDeps {
  db: Database;
  agent: AgentPort;
}

function splitMessage(text: string, maxLength = 4096): string[] {
  const messages: string[] = [];
  while (text.length > maxLength) {
    const splitAt = text.lastIndexOf('\n', maxLength);
    messages.push(text.slice(0, splitAt > 0 ? splitAt : maxLength));
    text = text.slice(splitAt > 0 ? splitAt : maxLength).trim();
  }
  if (text) messages.push(text);
  return messages;
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
