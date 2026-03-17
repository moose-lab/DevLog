"use client";

import { useState, useEffect, useCallback } from "react";
import type { FileLock } from "@/core/types-dashboard";

interface Conflict {
  file_path: string;
  worktree_a: string;
  worktree_b: string;
  detected_at: string;
}

export function useLocks() {
  const [locks, setLocks] = useState<FileLock[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocks = useCallback(async () => {
    try {
      const res = await fetch("/api/locks");
      if (res.ok) {
        const data = await res.json();
        setLocks(data.locks);
        setConflicts(data.conflicts);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocks();
    const interval = setInterval(fetchLocks, 3000);
    return () => clearInterval(interval);
  }, [fetchLocks]);

  const resolveConflict = async (filePath: string, worktreeName?: string) => {
    await fetch("/api/locks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: filePath, worktree_name: worktreeName }),
    });
    await fetchLocks();
  };

  return { locks, conflicts, loading, resolveConflict, refresh: fetchLocks };
}
