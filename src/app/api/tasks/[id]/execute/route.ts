import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/core/db";
import { resolveProjectId } from "@/lib/api-utils";
import { getProject } from "@/core/project-adapter";
import { createWorktree, listWorktrees } from "@/core/worktree-manager";
import { processManager } from "@/core/process-manager";
import { fileWatcher } from "@/core/file-watcher";
import { slugify, buildPromptTemplate } from "@/core/task-lifecycle";
import type { Task, Session } from "@/core/types-dashboard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const db = getDb();
  const projectId = resolveProjectId(req);

  // 1. Fetch and validate task
  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?")
    .get(taskId, projectId) as Task | undefined;

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!task.prompt) {
    return NextResponse.json(
      { error: "Task has no prompt. Add a prompt before executing." },
      { status: 400 }
    );
  }
  if (task.status !== "todo" && task.status !== "blocked") {
    return NextResponse.json(
      { error: `Cannot execute task with status '${task.status}'` },
      { status: 400 }
    );
  }

  // 2. Create worktree
  const project = getProject(projectId);
  const slug = slugify(task.title);
  const worktreeName = `task-${slug}`;
  const branchName = `task/${taskId.slice(0, 8)}-${slug}`;

  let worktree;
  try {
    worktree = await createWorktree(
      worktreeName,
      branchName,
      project.defaultBranch,
      projectId
    );
  } catch (err) {
    // Worktree/branch might already exist (retry scenario)
    const msg = (err as Error).message;
    if (msg.includes("already exists")) {
      const wts = await listWorktrees(projectId);
      worktree = wts.find((w) => w.name === worktreeName);
      if (!worktree) {
        return NextResponse.json(
          { error: `Worktree conflict: ${msg}` },
          { status: 409 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `Failed to create worktree: ${msg}` },
        { status: 500 }
      );
    }
  }

  // 3. Create session
  const sessionId = randomBytes(8).toString("hex");
  const prompt = buildPromptTemplate(task, project, worktree.path, branchName);

  const session = db
    .prepare(
      `INSERT INTO sessions (id, project_id, task_id, worktree_name, worktree_path, branch_name, status, prompt)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
       RETURNING *`
    )
    .get(
      sessionId,
      projectId,
      taskId,
      worktreeName,
      worktree.path,
      branchName,
      prompt
    ) as Session;

  // 4. Update task
  db.prepare(
    "UPDATE tasks SET status = 'in_progress', worktree_name = ?, session_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(worktreeName, sessionId, taskId);

  // 5. Start file watcher
  try {
    fileWatcher.watchWorktree(worktreeName, worktree.path, sessionId);
  } catch {
    // non-fatal
  }

  // 6. Spawn agent (non-blocking)
  try {
    processManager.sendMessage(sessionId, prompt);
  } catch (err) {
    db.prepare(
      "UPDATE sessions SET status = 'failed', ended_at = datetime('now') WHERE id = ?"
    ).run(sessionId);
    return NextResponse.json(
      { error: `Failed to start agent: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ session, worktree }, { status: 201 });
}
