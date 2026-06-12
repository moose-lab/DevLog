"use client";

import type { FileLock } from "@/core/types-dashboard";
import { usePolledJson } from "./use-polled-json";

interface Conflict {
  file_path: string;
  worktree_a: string;
  worktree_b: string;
  detected_at: string;
}

interface LocksPayload {
  locks: FileLock[];
  conflicts: Conflict[];
}

export function useLocks() {
  const { data, loading, error, refresh } = usePolledJson<LocksPayload>("/api/locks", 3000);

  const resolveConflict = async (filePath: string, worktreeName?: string) => {
    await fetch("/api/locks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: filePath, worktree_name: worktreeName }),
    });
    await refresh();
  };

  return {
    locks: data?.locks ?? [],
    conflicts: data?.conflicts ?? [],
    loading,
    error,
    resolveConflict,
    refresh,
  };
}
