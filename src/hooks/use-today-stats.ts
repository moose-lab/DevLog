"use client";

import { usePolledJson } from "./use-polled-json";

export interface TodayStats {
  sessions: number;
  costUSD: number;
  messages: number;
  toolCalls: number;
  filesTouched: number;
  projects: string[];
}

export function useTodayStats() {
  const { data, loading, error, refresh } = usePolledJson<TodayStats>(
    "/api/devlog?command=today",
    30_000,
  );

  return { stats: data, loading, error, refresh };
}
