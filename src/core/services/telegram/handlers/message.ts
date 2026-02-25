import type { Context } from 'grammy';
import type { Message } from '../../../entity/task.ts';
import type { Agent, Database } from '../../index.ts';

interface MessageHandlerDeps {
  db: Database;
  agent: Agent;
}

/**
 * Split message into chunks if it exceeds Telegram's message length limit
 */
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
 * Handle work report messages from users
 */
export async function handleMessage(ctx: Context, deps: MessageHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id?.toString();
  const fromId = ctx.from?.id.toString();
  const text = ctx.message?.text;

  if (!chatId || !fromId || !text) {
    return; // Not a text message
  }

  // Store the message
  const message: Message = {
    id: crypto.randomUUID(),
    userId: fromId,
    content: text,
    date: new Date(),
  };
  await deps.db.storeDailyWorkMessage(message);

  // // Send acknowledgement
  // await ctx.reply(
  //   'Đã ghi nhận công việc của bạn! Tôi sẽ lên công việc cho bạn ngay!!!😊\n\nYour work has been recorded. Generating report...',
  // );

  // Process with AI using runWithTools for tool calling support
  try {
    const sessionId = `telegram_${fromId}`;

    const { response } = await deps.agent.runWithTools(text, {
      sessionId,
      platform: 'telegram',
      chatId,
      verbose: false,
    });

    // Send response from agent (response is a string)
    if (response) {
      const parts = splitMessage(response);

      // Send each part (message may be split if too long)
      for (const part of parts) {
        await ctx.api.sendMessage(chatId, part, { parse_mode: 'HTML' });
      }
    }
  } catch (error) {
    await ctx.reply('Sorry, there was an error generating your report. Please try again later.');
    console.error('Error processing work report:', error);
  }
}
