"use client";

import { useCallback, useEffect, useState } from "react";
import type { CostReport } from "@/core/cost-tracker";

export function useCostReport() {
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    setError(null);
    try {
      const res = await fetch(`/api/devlog?command=cost${force ? "&refresh=1" : ""}`);
      if (!res.ok) {
        throw new Error(`Cost report failed with HTTP ${res.status}`);
      }
      setReport(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cost report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh(false);
  }, [refresh]);

  return { report, loading, error, refresh };
}
