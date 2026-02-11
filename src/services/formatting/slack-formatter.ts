import type { AgentResponse } from '../../entity/agent.ts';

export class SlackFormatter {
  format(response: AgentResponse): string {
    if (!response.success) return 'Error generating report';

    const formatTasks = (tasks: Array<{ project: string; task: string }>) => {
      if (tasks.length === 0) return '  •  N/A';
      return tasks
        .map((t) => {
          if (t.task !== 'string') {
            return `  •  ${t.project}: ${t.task}`;
          }
          return `  •  ${t.project}`;
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
}
