import { NextRequest, NextResponse } from "next/server";
import {
  listWorktrees,
  removeWorktree,
  getWorktreeDiff,
  getWorktreeLog,
} from "@/core/worktree-manager";
import { getWorktreeClientError } from "@/core/worktree-errors";

function worktreeErrorResponse(operation: string, err: unknown) {
  console.error(`Failed to ${operation}`, err);
  const { error, status } = getWorktreeClientError(err);
  return NextResponse.json({ error }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    const worktrees = await listWorktrees();
    const wt = worktrees.find((w) => w.name === name);
    if (!wt) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const [diff, log] = await Promise.all([
      getWorktreeDiff(name),
      getWorktreeLog(name),
    ]);

    return NextResponse.json({ ...wt, diff, log });
  } catch (err) {
    return worktreeErrorResponse("read worktree", err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    await removeWorktree(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return worktreeErrorResponse("remove worktree", err);
  }
}
