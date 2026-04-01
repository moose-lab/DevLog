import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getDb } from "@/core/db";
import { resolveProjectId } from "@/lib/api-utils";
import { getProject } from "@/core/project-adapter";
import { listWorktrees } from "@/core/worktree-manager";
import { compileSession } from "@/core/vcc";
import type { Task, Session } from "@/core/types-dashboard";

const execFileAsync = promisify(execFile);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const db = getDb();
  const projectId = resolveProjectId(req);

  // 1. Find task and its session
  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?")
    .get(taskId, projectId) as Task | undefined;

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!task.worktree_name || !task.session_id) {
    return NextResponse.json(
      { error: "Task has no worktree or session" },
      { status: 400 }
    );
  }

  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(task.session_id) as Session | undefined;

  if (!session?.branch_name) {
    return NextResponse.json(
      { error: "Session has no branch" },
      { status: 400 }
    );
  }

  // 2. Find worktree path
  const worktrees = await listWorktrees(projectId);
  const wt = worktrees.find((w) => w.name === task.worktree_name);
  if (!wt) {
    return NextResponse.json(
      { error: `Worktree '${task.worktree_name}' not found` },
      { status: 404 }
    );
  }

  const project = getProject(projectId);

  // 3. Push branch
  try {
    await execFileAsync(
      "git",
      ["push", "-u", "origin", session.branch_name],
      { cwd: wt.path, timeout: 30_000 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to push: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  // 4. Build PR body
  let brief = "";
  if (session.claude_session_id) {
    try {
      const vcc = await compileSession(session.claude_session_id, project.path);
      brief = vcc.brief.split("\n").slice(0, 50).join("\n");
    } catch {
      // non-fatal
    }
  }

  const body = [
    "## Task",
    task.title,
    task.description ? `\n${task.description}` : "",
    "",
    brief ? `## Agent Summary\n\n\`\`\`\n${brief}\n\`\`\`\n` : "",
    "---",
    "Created by DevLog",
  ]
    .filter(Boolean)
    .join("\n");

  // 5. Create PR via gh CLI
  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "pr",
        "create",
        "--title",
        task.title,
        "--body",
        body,
        "--base",
        project.defaultBranch,
        "--head",
        session.branch_name,
      ],
      { cwd: wt.path, timeout: 30_000 }
    );

    const prUrl = stdout.trim();

    // 6. Transition task to done
    db.prepare(
      "UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(taskId);

    return NextResponse.json({ url: prUrl });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to create PR: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
