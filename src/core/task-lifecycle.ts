import type Database from "better-sqlite3";
import type { Task } from "./types-dashboard";
import type { ProjectConfig } from "./types-project";
import { getDb } from "./db";
import { getWorktreeFilesChanged } from "./worktree-manager";
import {
  buildAgentExecutionInstructions,
  type AgentExecutionConfig,
} from "./agent-presets";
import {
  buildSessionRuntimeAuthInstructions,
  type SessionRuntimeAuthConfig,
} from "./session-runtime-auth";
import { isTaskExecutableStatus } from "./task-status-flow";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function buildPromptTemplate(
  task: Task,
  project: ProjectConfig,
  worktreePath: string,
  branchName: string,
  agentConfig?: AgentExecutionConfig,
  runtimeAuthConfig?: SessionRuntimeAuthConfig,
): string {
  const parts = [
    `# Task: ${task.title}`,
    "",
  ];
  if (task.description) {
    parts.push("## Description", task.description, "");
  }
  if (task.prompt) {
    parts.push("## Instructions", task.prompt, "");
  }
  if (agentConfig) {
    parts.push(
      "## Agent Execution",
      buildAgentExecutionInstructions(agentConfig),
      ...(runtimeAuthConfig
        ? [buildSessionRuntimeAuthInstructions(runtimeAuthConfig)]
        : []),
      "",
    );
  }
  parts.push(
    "## Context",
    `Project: ${project.name}`,
    `Working directory: ${worktreePath}`,
    `Branch: ${branchName}`,
    "",
    "Complete the task described above. Commit your changes when done."
  );
  return parts.join("\n");
}

export function markSessionFailedAndReleaseLinkedTask(
  db: Database.Database,
  sessionId: string,
  failReason: string,
): void {
  db.prepare(
    `UPDATE sessions
     SET status = 'failed', pid = NULL, ended_at = datetime('now')
     WHERE id = ? AND status NOT IN ('completed', 'killed')`,
  ).run(sessionId);

  const session = db
    .prepare("SELECT task_id FROM sessions WHERE id = ?")
    .get(sessionId) as { task_id: string | null } | undefined;
  if (!session?.task_id) return;

  const task = db
    .prepare("SELECT id, status, session_id FROM tasks WHERE id = ?")
    .get(session.task_id) as
    | { id: string; status: Task["status"]; session_id: string | null }
    | undefined;
  if (!task || task.status !== "in_progress" || task.session_id !== sessionId) {
    return;
  }

  db.prepare(
    `UPDATE tasks
     SET status = 'fail',
         fail_reason = ?,
         completed_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? AND status = 'in_progress' AND session_id = ?`,
  ).run(failReason, task.id, sessionId);
}

export type TaskSessionLaunchEligibility =
  | { ok: true; task: Pick<Task, "id" | "status"> }
  | { ok: false; status: 400 | 404; error: string };

export function validateTaskSessionLaunch(
  db: Database.Database,
  taskId: string,
  projectId: string,
): TaskSessionLaunchEligibility {
  const task = db
    .prepare("SELECT id, status FROM tasks WHERE id = ? AND project_id = ?")
    .get(taskId, projectId) as Pick<Task, "id" | "status"> | undefined;

  if (!task) {
    return { ok: false, status: 404, error: "Task not found" };
  }

  if (!isTaskExecutableStatus(task.status)) {
    return {
      ok: false,
      status: 400,
      error: `Cannot launch session for task with status '${task.status}'`,
    };
  }

  return { ok: true, task };
}

/**
 * exit_code semantics (IM-6): a number is a real exit status; NULL means the
 * code was never recorded (signal kill, legacy row) and must not be read as
 * failure — that routed every clean exit to 'blocked'.
 */
export function isFailedSessionExit(exitCode: number | null): boolean {
  return typeof exitCode === "number" && exitCode !== 0;
}

export async function onSessionExit(sessionId: string): Promise<void> {
  const db = getDb();
  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId) as {
    task_id: string | null;
    worktree_name: string | null;
    project_id: string;
    status: string;
    exit_code: number | null;
  } | undefined;

  if (!session?.task_id) return;

  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .get(session.task_id) as Task | undefined;

  if (!task || task.status === "done") return;

  let hasChanges = false;
  if (session.worktree_name) {
    try {
      const changed = await getWorktreeFilesChanged(
        session.worktree_name,
        session.project_id
      );
      hasChanges = changed > 0;
    } catch {
      // worktree might not exist
    }
  }

  const failedExit = isFailedSessionExit(session.exit_code);

  if (hasChanges && task.status === "in_progress") {
    db.prepare(
      "UPDATE tasks SET status = 'review', updated_at = datetime('now') WHERE id = ?"
    ).run(task.id);
  } else if (!hasChanges && failedExit && task.status === "in_progress") {
    db.prepare(
      "UPDATE tasks SET status = 'blocked', updated_at = datetime('now') WHERE id = ?"
    ).run(task.id);
  }
}
