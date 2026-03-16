import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { ChatMessage } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const messages = db
    .prepare("SELECT * FROM session_messages WHERE session_id = ? ORDER BY id ASC")
    .all(id) as ChatMessage[];

  return NextResponse.json(messages);
}
