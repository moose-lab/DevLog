import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/core/db";
import { resolveProjectId } from "@/lib/api-utils";
import type { Task } from "@/core/types-dashboard";

export async function GET(req: NextRequest) {
  const db = getDb();
  const projectId = resolveProjectId(req);
  const status = req.nextUrl.searchParams.get("status");

  let tasks: Task[];
  if (status) {
    tasks = db
      .prepare("SELECT * FROM tasks WHERE project_id = ? AND status = ? ORDER BY sort_order ASC")
      .all(projectId, status) as Task[];
  } else {
    tasks = db
      .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY status, sort_order ASC")
      .all(projectId) as Task[];
  }

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const projectId = resolveProjectId(req);
  const body = await req.json();

  const { title, description, priority, worktree_name, prompt } = body;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tasks WHERE status = 'todo' AND project_id = ?")
    .get(projectId) as { next: number };

  const stmt = db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, priority, worktree_name, prompt, sort_order)
    VALUES (hex(randomblob(8)), ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `);

  const task = stmt.get(
    projectId,
    title,
    description ?? null,
    priority ?? "medium",
    worktree_name ?? null,
    prompt ?? null,
    maxOrder.next
  ) as Task;

  return NextResponse.json(task, { status: 201 });
}
