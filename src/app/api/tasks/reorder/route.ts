import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/core/db";

interface ReorderItem {
  id: string;
  status: string;
  sort_order: number;
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = (await req.json()) as { items: ReorderItem[] };

  if (!body.items || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }

  const stmt = db.prepare(`
    UPDATE tasks
    SET status = ?, sort_order = ?, updated_at = datetime('now'),
        completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END
    WHERE id = ?
  `);

  const transaction = db.transaction((items: ReorderItem[]) => {
    for (const item of items) {
      stmt.run(item.status, item.sort_order, item.status, item.id);
    }
  });

  transaction(body.items);

  return NextResponse.json({ ok: true });
}
