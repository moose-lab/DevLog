import { NextRequest } from "next/server";
import { getActiveProject } from "./project-adapter";

export function resolveProjectId(req: NextRequest): string {
  return req.nextUrl.searchParams.get("projectId") ?? getActiveProject().id;
}
