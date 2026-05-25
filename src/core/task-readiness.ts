import type { SessionStatus, TaskStatus } from "./types-dashboard";

export function hasTaskPrompt(prompt: string | null | undefined): boolean {
  return typeof prompt === "string" && prompt.trim().length > 0;
}

export function normalizeReadyTaskStatus(
  status: TaskStatus,
  prompt: string | null | undefined
): TaskStatus {
  if (status === "todo" && !hasTaskPrompt(prompt)) {
    return "blocked";
  }
  return status;
}

export function isActiveSessionStatus(status: SessionStatus | null | undefined): boolean {
  return (
    status === "pending" ||
    status === "running" ||
    status === "idle" ||
    status === "paused"
  );
}
