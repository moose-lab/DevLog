import type { Task } from "./types-dashboard";
import type { ProjectConfig } from "./types-project";
import { getDb } from "./db";
import { getWorktreeFilesChanged } from "./worktree-manager";

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
  branchName: string
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

  if (hasChanges && task.status === "in_progress") {
    db.prepare(
      "UPDATE tasks SET status = 'review', updated_at = datetime('now') WHERE id = ?"
    ).run(task.id);
  } else if (!hasChanges && session.exit_code !== 0 && task.status === "in_progress") {
    db.prepare(
      "UPDATE tasks SET status = 'blocked', updated_at = datetime('now') WHERE id = ?"
    ).run(task.id);
  }
}
