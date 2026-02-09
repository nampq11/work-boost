import { GoogleGenAI } from '@google/genai';
import { AgentResponse, DailyWorkReport, TaskItem } from '../../entity/agent.ts';
import { Task } from '../../entity/task.ts';
import { HUMAN_PROMPT, SYSTEM_PROMPT, dailyWorkSchema } from './prompt/prompt.ts';

export class Agent {
  static instance: Agent;
  private ai: GoogleGenAI;

  private constructor(ai: GoogleGenAI) {
    this.ai = ai;
  }

  static async init(apiKey: string): Promise<Agent> {
    if (this.instance) return this.instance;

    const genAI = new GoogleGenAI({
      apiKey,
    });
    this.instance = new Agent(genAI);
    return this.instance;
  }

  async envoke(params: {
    content: string;
    verbose: boolean;
  }): Promise<AgentResponse> {
    try {
      const { content, verbose } = params;
      if (verbose) {
        console.log('Content: ', content);
      }

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'model',
            parts: [{ text: SYSTEM_PROMPT }],
          },
          {
            role: 'user',
            parts: [{ text: HUMAN_PROMPT.replace('{USER_INPUT}', content) }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: dailyWorkSchema,
        },
      });

      if (verbose) {
        console.log('Response: ', response.text);
      }
      if (!response.text) {
        return {
          success: false,
          error: 'No response from AI model',
        };
      }

      const parsedResponse = this.parseResponse(response.text);

      console.log('parse response: ', parsedResponse);

      if (this.validateResponse(parsedResponse)) {
        return {
          success: true,
          data: parsedResponse,
        };
      } else {
        return {
          success: false,
          error: 'Failed to parse response',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  public formatToSlack(response: AgentResponse): string {
    if (!response.success) return 'Error generating report';

    const formatTasks = (tasks: Array<{ project: string; task: string }>) => {
      if (tasks.length === 0) return ' •  N/A';
      return tasks
        .map((t) => {
          if (t.task !== 'string') {
            return ` •  ${t.project}: ${t.task}`;
          }
          return ` •  ${t.project}`;
        })
        .join('\n');
    };

    return `1. Việc hoàn thành hôm trước?
${formatTasks(response.data.completed)}
2. Việc dự định làm hôm trước nhưng không hoàn thành?
${formatTasks(response.data.incomplete)}
3. Việc dự định làm hôm nay?
${formatTasks(response.data.planned)}`;
  }

  private parseResponse(responseText: string): DailyWorkReport {
    try {
      const parsed = JSON.parse(responseText);
      return {
        completed: this.ensureTaskArray(parsed.completed),
        incomplete: this.ensureTaskArray(parsed.incomplete),
        planned: this.ensureTaskArray(parsed.planned),
      };
    } catch (error) {
      throw new Error(`Failed to parse response: ${error}`);
    }
  }

  private ensureTaskArray(tasks: unknown): TaskItem[] {
    if (!Array.isArray(tasks)) {
      return [];
    }
    return tasks.filter((task): task is TaskItem => {
      return (
        typeof task === 'object' &&
        task !== null &&
        'project' in task &&
        'task' in task &&
        typeof task.project === 'string' &&
        typeof task.task === 'string'
      );
    });
  }

  private validateResponse(response: unknown): response is DailyWorkReport {
    if (typeof response !== 'object' || response === null) return false;

    const report = response as DailyWorkReport;
    return (
      Array.isArray(report.completed) &&
      Array.isArray(report.incomplete) &&
      Array.isArray(report.planned) &&
      report.completed.every(this.isValidTaskItem) &&
      report.incomplete.every(this.isValidTaskItem) &&
      report.planned.every(this.isValidTaskItem)
    );
  }

  private isValidTaskItem(item: unknown): item is TaskItem {
    if (typeof item !== 'object' || item === null) return false;

    const task = item as TaskItem;
    return (
      typeof task.project === 'string' &&
      typeof task.task === 'string' &&
      task.project.trim() !== '' &&
      task.task.trim() !== ''
    );
  }
}
