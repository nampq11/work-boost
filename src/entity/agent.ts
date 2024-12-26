export interface TaskItem {
    project: string;
    task: string;
  }
  
export interface DailyWorkReport {
    completed: TaskItem[];
    incomplete: TaskItem[];
    planned: TaskItem[];
}

interface SucccessResponse {
    success: true,
    data: DailyWorkReport
}

interface ErrorResponse {
    success: false,
    error: string
}

export type AgentResponse = SucccessResponse | ErrorResponse;