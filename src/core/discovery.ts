import { readdir, stat } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import type { Project, Session, AggregateStats } from "./types";
import {
  decodePath,
  getProjectName,
  getClaudeProjectsDir,
} from "./paths";
import { scanSession } from "./parser";
import dayjs from "dayjs";

/**
 * Discover all Claude Code projects and sessions with rich metadata.
 * Accepts an optional progress callback for spinner updates.
 */
export async function discoverProjects(
  claudeDir?: string,
  onProgress?: (msg: string) => void
): Promise<Project[]> {
  const projectsDir = claudeDir || getClaudeProjectsDir();

  if (!existsSync(projectsDir)) {
    return [];
  }

  const entries = await readdir(projectsDir, { withFileTypes: true });
  const projects: Project[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectDir = join(projectsDir, entry.name);
    const decodedPath = decodePath(entry.name);
    const projectName = getProjectName(decodedPath);

    onProgress?.(`Scanning ${projectName}...`);

    const sessions = await discoverSessions(
      projectDir,
      decodedPath,
      projectName
    );

    if (sessions.length > 0) {
      projects.push({
        path: decodedPath,
        name: projectName,
        encodedPath: entry.name,
        sessionCount: sessions.length,
        sessions,
      });
    }
  }

  // Sort projects by most recent session
  projects.sort((a, b) => {
    const aLatest = Math.max(
      ...a.sessions.map((s) => s.updatedAt.getTime())
    );
    const bLatest = Math.max(
      ...b.sessions.map((s) => s.updatedAt.getTime())
    );
    return bLatest - aLatest;
  });

  return projects;
}

async function discoverSessions(
  projectDir: string,
  decodedPath: string,
  projectName: string
): Promise<Session[]> {
  const sessions: Session[] = [];

  try {
    const entries = await readdir(projectDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;

      const filePath = join(projectDir, entry.name);
      const sessionId = entry.name.replace(".jsonl", "");

      try {
        const fileStat = await stat(filePath);
        const meta = await scanSession(filePath);

        // Use internal timestamps when available (more accurate than fs mtime)
        const createdAt = meta.firstActivity.getTime() > 0 ? meta.firstActivity : fileStat.birthtime;
        const updatedAt = meta.lastActivity.getTime() > 0 ? meta.lastActivity : fileStat.mtime;

        sessions.push({
          id: sessionId,
          projectPath: decodedPath,
          projectName,
          filePath,
          createdAt,
          updatedAt,
          meta,
        });
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }

  sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return sessions;
}

/**
 * Compute aggregate stats with today-awareness for the emotional dashboard.
 */
export function computeStats(projects: Project[]): AggregateStats {
  const today = dayjs().startOf("day");
  let totalSessions = 0;
  let totalMessages = 0;
  let totalHumanTurns = 0;
  let totalAssistantTurns = 0;
  let totalToolCalls = 0;
  let totalCostUSD = 0;
  let totalDurationMs = 0;
  let todaySessions = 0;
  let todayMessages = 0;
  let todayCostUSD = 0;

  const allTools = new Set<string>();
  const allFiles = new Set<string>();
  const allModels = new Set<string>();

  let mostActiveProject = "";
  let mostActiveProjectSessions = 0;

  for (const project of projects) {
    totalSessions += project.sessionCount;

    if (project.sessionCount > mostActiveProjectSessions) {
      mostActiveProjectSessions = project.sessionCount;
      mostActiveProject = project.name;
    }

    for (const session of project.sessions) {
      const m = session.meta;
      totalMessages += m.messageCount;
      totalHumanTurns += m.humanTurns;
      totalAssistantTurns += m.assistantTurns;
      totalToolCalls += m.toolCalls;
      totalCostUSD += m.totalCostUSD;
      totalDurationMs += m.totalDurationMs;

      m.uniqueTools.forEach((t) => allTools.add(t));
      m.filesReferenced.forEach((f) => allFiles.add(f));
      m.models.forEach((model) => allModels.add(model));

      // Today tracking
      if (dayjs(session.updatedAt).isAfter(today)) {
        todaySessions++;
        todayMessages += m.messageCount;
        todayCostUSD += m.totalCostUSD;
      }
    }
  }

  return {
    totalProjects: projects.length,
    totalSessions,
    totalMessages,
    totalHumanTurns,
    totalAssistantTurns,
    totalToolCalls,
    totalCostUSD,
    totalDurationMs,
    uniqueToolsUsed: [...allTools],
    allFilesReferenced: [...allFiles],
    modelsUsed: [...allModels],
    todaySessions,
    todayMessages,
    todayCostUSD,
    mostActiveProject,
    mostActiveProjectSessions,
  };
}

/**
 * Group sessions by time period for smart display
 */
export function groupSessionsByTime(
  projects: Project[]
): {
  today: Session[];
  yesterday: Session[];
  thisWeek: Session[];
  older: Session[];
} {
  const now = dayjs();
  const todayStart = now.startOf("day");
  const yesterdayStart = todayStart.subtract(1, "day");
  const weekStart = now.startOf("week");

  const groups = {
    today: [] as Session[],
    yesterday: [] as Session[],
    thisWeek: [] as Session[],
    older: [] as Session[],
  };

  for (const project of projects) {
    for (const session of project.sessions) {
      const d = dayjs(session.updatedAt);
      if (d.isAfter(todayStart)) {
        groups.today.push(session);
      } else if (d.isAfter(yesterdayStart)) {
        groups.yesterday.push(session);
      } else if (d.isAfter(weekStart)) {
        groups.thisWeek.push(session);
      } else {
        groups.older.push(session);
      }
    }
  }

  // Sort each group by most recent first
  for (const group of Object.values(groups)) {
    group.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  return groups;
}
