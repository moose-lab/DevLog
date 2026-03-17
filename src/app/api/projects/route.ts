import { NextResponse } from "next/server";
import { listProjects, getActiveProject } from "@/core/project-adapter";

export async function GET() {
  const projects = listProjects();
  const active = getActiveProject();
  return NextResponse.json({ projects, activeId: active.id });
}
