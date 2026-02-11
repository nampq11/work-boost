import type { AgentResponse, TaskItem } from '../../entity/agent.ts';

/**
 * Formatter for Telegram messages using HTML parse mode.
 * Handles HTML escaping and message splitting for 4096 character limit.
 */
export class TelegramFormatter {
  /**
   * Format AI response for Telegram (HTML)
   * Escapes: < > &
   * Max length: 4096 characters
   */
  format(response: AgentResponse): string[] {
    const content = this.buildContent(response);
    return this.splitMessage(content, 4096);
  }

  private buildContent(response: AgentResponse): string {
    if (!response.success) {
      return '<b>Error</b>\n\nFailed to generate report. Please try again.';
    }

    const formatTasks = (tasks: TaskItem[], label: string): string => {
      if (tasks.length === 0) return `<b>${label}</b>\n• N/A\n`;
      const items = tasks
        .map((t) => `• ${this.escapeHtml(t.project)}: ${this.escapeHtml(t.task)}`)
        .join('\n');
      return `<b>${label}</b>\n${items}\n`;
    };

    return (
      formatTasks(response.data.completed, '1. Việc hoàn thành hôm trước?') +
      formatTasks(response.data.incomplete, '2. Việc dự định làm nhưng chưa hoàn thành?') +
      formatTasks(response.data.planned, '3. Việc dự định làm hôm nay?')
    );
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const messages: string[] = [];
    while (text.length > maxLength) {
      const splitAt = text.lastIndexOf('\n', maxLength);
      messages.push(text.slice(0, splitAt > 0 ? splitAt : maxLength));
      text = text.slice(splitAt > 0 ? splitAt : maxLength).trim();
    }
    if (text) messages.push(text);
    return messages;
  }
}
