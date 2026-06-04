import { isActiveSessionStatus } from "@/core/task-readiness";
import { isTaskExecutableStatus } from "@/core/task-status-flow";
import type { Session, Task } from "@/core/types-dashboard";

export function canExecuteTaskFromCard(task: Task, session?: Session): boolean {
  return (
    isTaskExecutableStatus(task.status) &&
    !isActiveSessionStatus(session?.status)
  );
}

export function canPauseTaskFromCard(task: Task, session?: Session): boolean {
  return (
    task.status === "in_progress" &&
    !!session &&
    isActiveSessionStatus(session.status) &&
    session.status !== "paused"
  );
}
