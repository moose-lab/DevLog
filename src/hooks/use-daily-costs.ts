"use client";

import { useMemo } from "react";
import type { DailyEntry } from "@/app/api/devlog/daily/route";
import { usePolledJson } from "./use-polled-json";

export type { DailyEntry };

export function useDailyCosts(days: 7 | 30 = 30) {
  const { data, loading, error } = usePolledJson<{ days?: DailyEntry[] }>(
    `/api/devlog/daily?days=${days}`,
    60_000,
  );
  const entries = useMemo(() => data?.days ?? [], [data]);
  return { days: entries, loading, error };
}
