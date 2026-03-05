import { readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import dayjs from "dayjs";
import type { StatsCache, AggregateStats } from "./types.js";
import { getDevlogDir } from "../utils/paths.js";

const CACHE_FILENAME = "stats-cache.json";
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

function getCachePath(): string {
  return join(getDevlogDir(), "db", CACHE_FILENAME);
}

export function readStatsCache(): StatsCache | null {
  try {
    const raw = readFileSync(getCachePath(), "utf-8");
    return JSON.parse(raw) as StatsCache;
  } catch {
    return null;
  }
}

export function writeStatsCache(cache: StatsCache): void {
  const cachePath = getCachePath();
  const tmpPath = cachePath + ".tmp";
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(tmpPath, JSON.stringify(cache, null, 2), "utf-8");
    renameSync(tmpPath, cachePath);
  } catch {
    // Best-effort — don't crash the command if cache write fails
  }
}

export function isCacheFresh(cache: StatsCache, maxAgeMs?: number): boolean {
  const maxAge = maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const todayStr = dayjs().format("YYYY-MM-DD");

  // Invalidate on day change
  if (cache.todayDate !== todayStr) return false;

  const age = Date.now() - new Date(cache.timestamp).getTime();
  return age < maxAge;
}

export function updateCacheFromStats(stats: AggregateStats): void {
  const now = dayjs();
  const cache: StatsCache = {
    timestamp: now.toISOString(),
    todayDate: now.format("YYYY-MM-DD"),
    today: {
      sessions: stats.todaySessions,
      costUSD: stats.todayCostUSD,
      messages: stats.todayMessages,
      toolCalls: stats.totalToolCalls, // approx — full stats don't split today's tool calls
      filesTouched: stats.allFilesReferenced.length,
      projects: stats.mostActiveProject ? [stats.mostActiveProject] : [],
    },
    allTime: {
      sessions: stats.totalSessions,
      costUSD: stats.totalCostUSD,
      projects: stats.totalProjects,
    },
  };
  writeStatsCache(cache);
}
