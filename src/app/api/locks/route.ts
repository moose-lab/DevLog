import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/core/db";
import { resolveProjectId } from "@/lib/api-utils";
import { fileWatcher } from "@/core/file-watcher";
import type { FileLock } from "@/core/types-dashboard";

export async function GET(req: NextRequest) {
  const db = getDb();
  const projectId = resolveProjectId(req);

  const locks = db
    .prepare("SELECT * FROM file_locks WHERE project_id = ? AND resolved_at IS NULL ORDER BY detected_at DESC")
    .all(projectId) as FileLock[];

  const conflicts = db
    .prepare(
      `SELECT l1.file_path, l1.worktree_name AS worktree_a, l2.worktree_name AS worktree_b, l1.detected_at
       FROM file_locks l1
       JOIN file_locks l2
         ON l1.file_path = l2.file_path
         AND l1.worktree_name < l2.worktree_name
         AND l1.resolved_at IS NULL
         AND l2.resolved_at IS NULL
       WHERE l1.project_id = ? AND l2.project_id = ?`
    )
    .all(projectId, projectId) as { file_path: string; worktree_a: string; worktree_b: string; detected_at: string }[];

  return NextResponse.json({ locks, conflicts });
}

export async function POST(req: NextRequest) {
  const { file_path, worktree_name } = await req.json();

  if (!file_path) {
    return NextResponse.json({ error: "file_path is required" }, { status: 400 });
  }

  fileWatcher.resolveConflict(file_path, worktree_name);

  return NextResponse.json({ ok: true });
}
