import { isActiveSessionStatus } from "@/core/task-readiness";
import type { Session, Task } from "@/core/types-dashboard";

export function canExecuteTaskFromCard(task: Task, session?: Session): boolean {
  return (
    (task.status === "todo" || task.status === "blocked") &&
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
