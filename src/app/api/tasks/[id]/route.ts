import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/core/db";
import { normalizeReadyTaskStatus } from "@/core/task-readiness";
import type { Task } from "@/core/types-dashboard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;

  if (!task) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(task);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const nextPrompt = "prompt" in body ? body.prompt : existing.prompt;
  const requestedStatus = ("status" in body ? body.status : existing.status) as Task["status"];
  const nextStatus = normalizeReadyTaskStatus(requestedStatus, nextPrompt);

  for (const key of ["title", "description", "priority", "worktree_name", "session_id", "sort_order", "prompt"] as const) {
    if (key in body) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if ("status" in body || nextStatus !== existing.status) {
    fields.push("status = ?");
    values.push(nextStatus);
  }

  if (nextStatus === "done" && existing.status !== "done") {
    fields.push("completed_at = datetime('now')");
  } else if (("status" in body || nextStatus !== existing.status) && nextStatus !== "done") {
    fields.push("completed_at = NULL");
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const task = db
    .prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? RETURNING *`)
    .get(...values) as Task;

  return NextResponse.json(task);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);

  if (result.changes === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
