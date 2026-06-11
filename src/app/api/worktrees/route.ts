import { NextRequest, NextResponse } from "next/server";
import {
  listWorktrees,
  createWorktree,
  getWorktreeFilesChanged,
} from "@/core/worktree-manager";
import { resolveProjectId } from "@/lib/api-utils";
import {
  validateBranchName,
  validateWorktreeName,
} from "@/core/worktree-validation";

export async function GET(req: NextRequest) {
  try {
    const projectId = resolveProjectId(req);
    const worktrees = await listWorktrees(projectId);

    const enriched = await Promise.all(
      worktrees.map(async (wt) => ({
        ...wt,
        filesChanged: await getWorktreeFilesChanged(wt.name, projectId),
      }))
    );

    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, branch, baseBranch } = await req.json();

    if (typeof name !== "string" || typeof branch !== "string" || !name || !branch) {
      return NextResponse.json(
        { error: "name and branch are required" },
        { status: 400 }
      );
    }

    for (const check of [
      validateWorktreeName(name),
      validateBranchName(branch),
      ...(baseBranch !== undefined ? [validateBranchName(String(baseBranch))] : []),
    ]) {
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
    }

    const projectId = resolveProjectId(req);
    const wt = await createWorktree(name, branch, baseBranch, projectId);
    return NextResponse.json(wt, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
