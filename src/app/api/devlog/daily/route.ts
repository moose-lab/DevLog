import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import dayjs from "dayjs";
import { getClaudeProjectsDir } from "@/core/paths";
import { scanSession } from "@/core/parser";
import { decodePath } from "@/core/paths";

export interface DailyEntry {
  date: string; // "YYYY-MM-DD"
  costUSD: number;
  sessions: number;
}

// GET /api/devlog/daily?days=30
export async function GET(req: NextRequest) {
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam ?? "30", 10), 1), 90);

  try {
    const claudeDir = getClaudeProjectsDir();
    const cutoff = dayjs().subtract(days, "day").startOf("day").valueOf();

    // Bucket: date string → { costUSD, sessions }
    const buckets = new Map<string, { costUSD: number; sessions: number }>();

    // Pre-fill all dates in range with zeros so chart has no gaps
    for (let i = days - 1; i >= 0; i--) {
      const dateKey = dayjs().subtract(i, "day").format("YYYY-MM-DD");
      buckets.set(dateKey, { costUSD: 0, sessions: 0 });
    }

    let entries;
    try {
      entries = await readdir(claudeDir, { withFileTypes: true });
    } catch {
      return NextResponse.json({ days: [] });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectDir = join(claudeDir, entry.name);

      let files;
      try {
        files = await readdir(projectDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const filePath = join(projectDir, file.name);

        try {
          const fileStat = await stat(filePath);
          // Quick filter: skip files untouched before our window
          if (fileStat.mtimeMs < cutoff) continue;

          const meta = await scanSession(filePath);
          const lastActivity = meta.lastActivity.getTime();
          if (lastActivity < cutoff) continue;

          const dateKey = dayjs(meta.lastActivity).format("YYYY-MM-DD");
          const existing = buckets.get(dateKey) ?? { costUSD: 0, sessions: 0 };
          existing.costUSD += meta.totalCostUSD;
          existing.sessions += 1;
          buckets.set(dateKey, existing);
        } catch {
          continue;
        }
      }
    }

    const result: DailyEntry[] = Array.from(buckets.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ days: result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
