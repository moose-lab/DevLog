"use client";

import { useState, useEffect, useCallback } from "react";
import type { DevLogStats } from "@/core/types-dashboard";

export function useDevlog() {
  const [stats, setStats] = useState<DevLogStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/devlog?command=stats");
      if (res.ok) {
        setStats(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, refresh: fetchStats };
}
