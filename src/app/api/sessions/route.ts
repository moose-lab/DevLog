import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/core/db";
import { resolveProjectId } from "@/lib/api-utils";
import { processManager } from "@/core/process-manager";
import type { Session } from "@/core/types-dashboard";

export async function GET(req: NextRequest) {
  const db = getDb();
  const projectId = resolveProjectId(req);
  const sessions = db
    .prepare("SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC")
    .all(projectId) as Session[];
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const projectId = resolveProjectId(req);
  const body = await req.json();

  const { task_id, worktree_name, worktree_path, branch_name, prompt } = body;
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!worktree_path) {
    return NextResponse.json({ error: "worktree_path is required" }, { status: 400 });
  }

  const id = randomBytes(8).toString("hex");

  const session = db
    .prepare(
      `INSERT INTO sessions (id, project_id, task_id, worktree_name, worktree_path, branch_name, status, prompt)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
       RETURNING *`
    )
    .get(
      id,
      projectId,
      task_id ?? null,
      worktree_name ?? null,
      worktree_path,
      branch_name ?? null,
      prompt
    ) as Session;

  // Link session to task if provided
  if (task_id) {
    db.prepare("UPDATE tasks SET session_id = ?, status = 'in_progress' WHERE id = ?").run(
      id,
      task_id
    );
  }

  // Send the initial prompt as the first turn
  try {
    // Don't await — let it process in the background
    processManager.sendMessage(id, prompt);
  } catch (err) {
    db.prepare(
      "UPDATE sessions SET status = 'failed', ended_at = datetime('now') WHERE id = ?"
    ).run(id);
    return NextResponse.json(
      { error: `Failed to start: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(session, { status: 201 });
}
