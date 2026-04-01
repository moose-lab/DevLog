"use client";

import { useState, useEffect, useCallback } from "react";

export interface TodayStats {
  sessions: number;
  costUSD: number;
  messages: number;
  toolCalls: number;
  filesTouched: number;
  projects: string[];
}

export function useTodayStats() {
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/devlog?command=today");
      if (res.ok) {
        setStats(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, refresh: fetchStats };
}
