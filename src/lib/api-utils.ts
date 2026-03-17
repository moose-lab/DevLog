import { NextRequest } from "next/server";
import { getActiveProject } from "@/core/project-adapter";

export function resolveProjectId(req: NextRequest): string {
  return req.nextUrl.searchParams.get("projectId") ?? getActiveProject().id;
}
