import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/core/db";
import { getProject } from "@/core/project-adapter";
import { compileSession } from "@/core/vcc";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const grep = req.nextUrl.searchParams.get("grep") ?? undefined;

  const db = getDb();
  const session = db
    .prepare("SELECT claude_session_id, project_id, status FROM sessions WHERE id = ?")
    .get(sessionId) as {
    claude_session_id: string | null;
    project_id: string;
    status: string;
  } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!session.claude_session_id) {
    return NextResponse.json({ full: "", brief: "", search: "" });
  }

  try {
    const project = getProject(session.project_id);
    const output = await compileSession(
      session.claude_session_id,
      project.path,
      grep
    );

    const isActive = ["running", "idle", "pending", "paused"].includes(session.status);
    const maxAge = isActive ? 10 : 300;

    return NextResponse.json(output, {
      headers: {
        "Cache-Control": `private, max-age=${maxAge}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, full: "", brief: "", search: "" },
      { status: 200 }
    );
  }
}
