import { readdir, stat } from "fs/promises";
import { join } from "path";
import dayjs from "dayjs";
import type { StatsCache } from "./types.js";
import { decodePath, getProjectName } from "../utils/paths.js";
import { scanSession } from "./parser.js";

/**
 * Fast discovery: only scan JSONL files modified today.
 * Reduces scan set from 2000+ to ~10-50 files for <300ms response.
 */
export async function discoverTodayStats(
  claudeDir: string
): Promise<StatsCache["today"]> {
  const todayMidnight = dayjs().startOf("day").valueOf();

  const result: StatsCache["today"] = {
    sessions: 0,
    costUSD: 0,
    messages: 0,
    toolCalls: 0,
    filesTouched: 0,
    projects: [],
  };

  const fileSet = new Set<string>();
  const projectSet = new Set<string>();

  let entries;
  try {
    entries = await readdir(claudeDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectDir = join(claudeDir, entry.name);
    const decodedPath = decodePath(entry.name);
    const projectName = getProjectName(decodedPath);

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
        // Skip files not modified today
        if (fileStat.mtimeMs < todayMidnight) continue;

        const meta = await scanSession(filePath);

        // Only count if session actually has today activity
        const lastActivity = meta.lastActivity.getTime();
        if (lastActivity < todayMidnight) continue;

        result.sessions++;
        result.costUSD += meta.totalCostUSD;
        result.messages += meta.messageCount;
        result.toolCalls += meta.toolCalls;
        for (const f of meta.filesReferenced) fileSet.add(f);
        projectSet.add(projectName);
      } catch {
        continue;
      }
    }
  }

  result.filesTouched = fileSet.size;
  result.projects = [...projectSet];

  return result;
}
