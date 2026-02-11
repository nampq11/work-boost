import type { Context } from 'grammy';
import type { Message } from '../../../entity/task.ts';
import type { Agent, Database } from '../../../services/_index.ts';
import { TelegramFormatter } from '../../formatting/telegram-formatter.ts';

interface MessageHandlerDeps {
  db: Database;
  agent: Agent;
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

  // Send acknowledgement
  await ctx.reply(
    'Đã ghi nhận công việc của bạn! Tôi sẽ lên công việc cho bạn ngay!!!😊\n\nYour work has been recorded. Generating report...',
  );

  // Process with AI
  try {
    const agentResponse = await deps.agent.envoke({
      content: text,
      verbose: false,
    });

    const formatter = new TelegramFormatter();
    const parts = formatter.format(agentResponse);

    // Send each part (message may be split if too long)
    for (const part of parts) {
      await ctx.api.sendMessage(chatId, part, { parse_mode: 'HTML' });
    }
  } catch (error) {
    await ctx.reply('Sorry, there was an error generating your report. Please try again later.');
    console.error('Error processing work report:', error);
  }
}
