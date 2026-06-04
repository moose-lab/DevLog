import type { TaskStatus } from "./types-dashboard";

export type TaskBoardColumn =
  | {
      id: TaskStatus;
      type: "status";
      label: string;
      status: TaskStatus;
    }
  | {
      id: "queue_failed";
      type: "group";
      label: string;
      statuses: TaskStatus[];
    };

const TASK_BOARD_COLUMNS: readonly TaskBoardColumn[] = [
  { id: "todo", type: "status", label: "Todo", status: "todo" },
  {
    id: "queue_failed",
    type: "group",
    label: "Queue / Failed",
    statuses: ["in_queue", "fail"],
  },
  {
    id: "in_progress",
    type: "status",
    label: "In Progress",
    status: "in_progress",
  },
  { id: "review", type: "status", label: "Review", status: "review" },
  { id: "blocked", type: "status", label: "Blocked", status: "blocked" },
  { id: "done", type: "status", label: "Done", status: "done" },
];

const EXECUTABLE_TASK_STATUSES = new Set<TaskStatus>([
  "todo",
  "blocked",
  "fail",
]);

export function getTaskBoardColumns(): TaskBoardColumn[] {
  return TASK_BOARD_COLUMNS.map((column) =>
    column.type === "group"
      ? { ...column, statuses: [...column.statuses] }
      : { ...column },
  );
}

export function isTaskExecutableStatus(status: TaskStatus): boolean {
  return EXECUTABLE_TASK_STATUSES.has(status);
}
