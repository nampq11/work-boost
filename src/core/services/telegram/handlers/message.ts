import type { Context } from 'grammy';
import type { Message } from '../../../entity/task.ts';
import type { Agent, Database, TelegramService } from '../../index.ts';

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
 * Create an async generator that streams the agent response
 */
async function* streamAgentResponse(
  agent: any,
  text: string,
  sessionId: string,
  chatId: string,
): AsyncGenerator<string, void, unknown> {
  // Accumulate chunks as they arrive
  const chunks: string[] = [];

  await agent.stream(
    text,
    async (chunk) => {
      if (!chunk.isFinal && chunk.content) {
        chunks.push(chunk.content);
      }
    },
    { sessionId, platform: 'telegram', chatId },
  );

  // Yield the accumulated content in smaller chunks for streaming effect
  const fullContent = chunks.join('');
  const chunkSize = 15; // Characters per yield

  for (let i = 0; i < fullContent.length; i += chunkSize) {
    yield fullContent.slice(i, i + chunkSize);
    // Small delay for animated effect
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
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

  // Process with AI using streaming for better UX
  try {
    const sessionId = `telegram_${fromId}`;
    const agent = deps.agent;

    // Check if context supports streaming (replyWithStream)
    const hasStreaming = 'replyWithStream' in ctx && typeof ctx.replyWithStream === 'function';

    if (hasStreaming) {
      // Use grammY streaming for animated message effect
      // @ts-ignore - replyWithStream is added by stream plugin
      await ctx.replyWithStream(streamAgentResponse(agent, text, sessionId, chatId));
    } else {
      // Fallback: accumulate and send
      const result = await agent.stream(
        text,
        async (_chunk) => {
          // Accumulate
        },
        { sessionId, platform: 'telegram', chatId },
      );

      // Send the final response
      if (result.success && result.content) {
        const parts = splitMessage(result.content);

        // Send each part (message may be split if too long)
        for (const part of parts) {
          await ctx.api.sendMessage(chatId, part, { parse_mode: 'HTML' });
        }
      }
    }
  } catch (error) {
    await ctx.reply('Sorry, there was an error generating your report. Please try again later.');
    console.error('Error processing work report:', error);
  }
}
