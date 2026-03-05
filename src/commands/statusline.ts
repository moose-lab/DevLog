import { ensureInit } from "../core/config.js";
import { readStatsCache, writeStatsCache, isCacheFresh } from "../core/cache.js";
import { discoverTodayStats } from "../core/fast-discovery.js";
import type { StatsCache } from "../core/types.js";
import dayjs from "dayjs";

interface StatuslineOptions {
  cache?: boolean;
}

interface StdinSession {
  context_window?: {
    used_percentage?: number;
    used_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  turn_number?: number;
  session_id?: string;
}

export async function statuslineCommand(options: StatuslineOptions): Promise<void> {
  const { config } = ensureInit();
  const useCache = options.cache !== false;

  // 1. Read stdin if piped (non-blocking, 50ms timeout)
  const stdinData = process.stdin.isTTY ? null : await readStdinWithTimeout(50);

  // 2. Read cache
  let cache = useCache ? readStatsCache() : null;

  // 3. If cache fresh → use directly
  if (cache && useCache && isCacheFresh(cache)) {
    process.stdout.write(formatStatusLine(cache, stdinData));
    return;
  }

  // 4. If stale/missing → fast-discovery → update cache
  try {
    const todayStats = await discoverTodayStats(config.claudeDir);
    const now = dayjs();
    cache = {
      timestamp: now.toISOString(),
      todayDate: now.format("YYYY-MM-DD"),
      today: todayStats,
      allTime: cache?.allTime ?? { sessions: 0, costUSD: 0, projects: 0 },
    };
    writeStatsCache(cache);
  } catch {
    if (!cache) {
      process.stdout.write("DevLog: scanning...");
      return;
    }
  }

  // 5. Format and output
  process.stdout.write(formatStatusLine(cache!, stdinData));
}

async function readStdinWithTimeout(ms: number): Promise<StdinSession | null> {
  return Promise.race<StdinSession | null>([
    new Promise((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf-8");
      process.stdin.on("data", (chunk) => { data += chunk; });
      process.stdin.on("end", () => {
        try {
          resolve(JSON.parse(data) as StdinSession);
        } catch {
          resolve(null);
        }
      });
      process.stdin.resume();
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function formatStatusLine(cache: StatsCache, stdinData: StdinSession | null): string {
  const parts: string[] = [];

  // Context window from Claude Code stdin
  if (stdinData?.context_window?.used_percentage != null) {
    parts.push(`ctx ${stdinData.context_window.used_percentage}%`);
  }

  // Today stats
  if (cache.today.sessions > 0) {
    const sessionWord = cache.today.sessions === 1 ? "session" : "sessions";
    parts.push(`${formatCost(cache.today.costUSD)} today (${cache.today.sessions} ${sessionWord})`);
  } else {
    parts.push("No sessions today");
  }

  // All-time total
  if (cache.allTime.costUSD > 0) {
    parts.push(`${formatCost(cache.allTime.costUSD)} total`);
  }

  if (parts.length === 0) {
    return "DevLog: no data yet";
  }

  return parts.join(" \u00B7 ");
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd >= 1000) return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${usd.toFixed(2)}`;
}
