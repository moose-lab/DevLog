import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();

    const sessions = db
      .prepare(
        "SELECT status, COUNT(*) as count FROM sessions GROUP BY status"
      )
      .all() as { status: string; count: number }[];

    const taskCount = db
      .prepare("SELECT COUNT(*) as count FROM tasks")
      .get() as { count: number };

    const conflictCount = db
      .prepare("SELECT COUNT(*) as count FROM active_conflicts")
      .get() as { count: number };

    return NextResponse.json({
      ok: true,
      sessions: Object.fromEntries(sessions.map((s) => [s.status, s.count])),
      tasks: taskCount.count,
      conflicts: conflictCount.count,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
