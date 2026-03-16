import { NextRequest, NextResponse } from "next/server";
import { setActiveProject, getActiveProject } from "@/lib/project-adapter";

export async function PUT(req: NextRequest) {
  const { projectId } = await req.json();
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  try {
    setActiveProject(projectId);
    return NextResponse.json(getActiveProject());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
