"use client";

import { useState, useEffect, useCallback } from "react";
import type { DailyEntry } from "@/app/api/devlog/daily/route";

export type { DailyEntry };

export function useDailyCosts(days: 7 | 30 = 30) {
  const [data, setData] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/devlog/daily?days=${days}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.days ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    setLoading(true);
    fetch_();
    const interval = setInterval(fetch_, 60_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { days: data, loading };
}
