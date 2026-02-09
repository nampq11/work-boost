export type Task = {
  id: string;
  title: string;
  status: string;
  createdBy: string;
  dueDate: Date;
  createAt: Date;
  updateAt: Date;
  taskNumber: string;
  priority: number;
  tags: string[];
};

export type Tag = {
  id: string;
  name: string;
};

export enum Status {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export type Message = {
  id: string;
  userId: string;
  content: string;
  date: Date;
};
