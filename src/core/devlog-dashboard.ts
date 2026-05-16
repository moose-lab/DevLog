import type { DevLogStats } from "./types-dashboard";

type StatsPayload = Record<string, unknown>;

export function normalizeDevLogStats(payload: unknown): DevLogStats | null {
  if (!payload || typeof payload !== "object") return null;

  const stats = payload as StatsPayload;
  return {
    sessions: numberFrom(stats.sessions, stats.totalSessions),
    totalCost: numberFrom(stats.totalCost, stats.totalCostUSD),
    toolCalls: numberFrom(stats.toolCalls, stats.totalToolCalls),
    filesTouched: filesTouchedFrom(stats),
  };
}

function filesTouchedFrom(stats: StatsPayload): number {
  if (typeof stats.filesTouched === "number") return finiteOrZero(stats.filesTouched);
  if (typeof stats.totalFilesTouched === "number") return finiteOrZero(stats.totalFilesTouched);
  if (Array.isArray(stats.allFilesReferenced)) return stats.allFilesReferenced.length;
  return 0;
}

function numberFrom(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number") return finiteOrZero(value);
  }
  return 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
