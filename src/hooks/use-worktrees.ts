"use client";

import type { Worktree } from "@/core/types-dashboard";
import { usePolledJson } from "./use-polled-json";

export function useWorktrees() {
  const { data, loading, error, refresh } = usePolledJson<Worktree[]>("/api/worktrees", 10_000);
  const worktrees = data ?? [];

  const createWorktree = async (name: string, branch: string, baseBranch?: string) => {
    const res = await fetch("/api/worktrees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, branch, baseBranch }),
    });
    if (res.ok) {
      const created = (await res.json()) as Worktree;
      await refresh();
      return created;
    }
    const err = await res.json();
    throw new Error(err.error);
  };

  const removeWorktree = async (name: string) => {
    const res = await fetch(`/api/worktrees/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await refresh();
    }
  };

  return { worktrees, loading, error, createWorktree, removeWorktree, refresh };
}
