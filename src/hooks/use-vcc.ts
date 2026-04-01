"use client";

import { useState, useEffect, useCallback } from "react";

interface VccData {
  full: string;
  brief: string;
  search: string;
  error?: string;
}

export function useVcc(
  sessionId: string | null,
  isActive: boolean,
  grep?: string
) {
  const [data, setData] = useState<VccData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchVcc = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (grep) params.set("grep", grep);
      const url = `/api/sessions/${sessionId}/vcc?${params}`;
      const res = await fetch(url);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, grep]);

  useEffect(() => {
    fetchVcc();
    const interval = setInterval(fetchVcc, isActive ? 15_000 : 60_000);
    return () => clearInterval(interval);
  }, [fetchVcc, isActive]);

  return { data, loading, refresh: fetchVcc };
}
