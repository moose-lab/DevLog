import { NextRequest, NextResponse } from "next/server";
import {
  listWorktrees,
  removeWorktree,
  getWorktreeDiff,
  getWorktreeLog,
} from "@/core/worktree-manager";

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
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
