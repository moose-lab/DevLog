"use client";

import { useState, useEffect, useCallback } from "react";
import type { Worktree } from "@/lib/types";

export function useWorktrees() {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorktrees = useCallback(async () => {
    try {
      const res = await fetch("/api/worktrees");
      if (res.ok) {
        setWorktrees(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorktrees();
    const interval = setInterval(fetchWorktrees, 10000);
    return () => clearInterval(interval);
  }, [fetchWorktrees]);

  const createWorktree = async (name: string, branch: string, baseBranch?: string) => {
    const res = await fetch("/api/worktrees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, branch, baseBranch }),
    });
    if (res.ok) {
      await fetchWorktrees();
      return (await res.json()) as Worktree;
    }
    const err = await res.json();
    throw new Error(err.error);
  };

  const removeWorktree = async (name: string) => {
    const res = await fetch(`/api/worktrees/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await fetchWorktrees();
    }
  };

  return { worktrees, loading, createWorktree, removeWorktree, refresh: fetchWorktrees };
}
