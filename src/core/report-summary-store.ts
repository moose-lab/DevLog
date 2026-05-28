import {
  mkdirSync as fsMkdirSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";
import { join } from "node:path";
import { getDb } from "./db";
import {
  buildReportSummary,
  type ReportSummary,
  type ReportSession,
  type ReportTask,
  type ReportPeriod,
} from "./report-summary";
import { getProject, listProjects } from "./project-adapter";
import { loadConfig } from "./config";

export interface PersistReportSnapshotResult {
  ok: boolean;
  path?: string;
  error?: string;
}

interface PersistReportSnapshotOptions {
  reportsDir?: string;
  mkdirSync?: typeof fsMkdirSync;
  writeFileSync?: typeof fsWriteFileSync;
}

export function loadReportSummary(input: {
  date: string;
  period: ReportPeriod;
  projectId?: string | null;
}): ReportSummary {
  const db = getDb();
  const projectFilter = input.projectId?.trim() || null;
  const tasks = projectFilter
    ? db
      .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectFilter) as ReportTask[]
    : db
      .prepare("SELECT * FROM tasks ORDER BY project_id, updated_at DESC")
      .all() as ReportTask[];
  const sessions = projectFilter
    ? db
      .prepare("SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at ASC")
      .all(projectFilter) as ReportSession[]
    : db
      .prepare("SELECT * FROM sessions ORDER BY project_id, started_at ASC")
      .all() as ReportSession[];

  const projectNames = new Map(
    listProjects().map((project) => [project.id, project.name]),
  );
  const summaryProjectId = projectFilter ?? "all";
  let projectName = "All Projects";
  try {
    if (projectFilter) projectName = getProject(projectFilter).name;
  } catch {
    projectName = projectFilter ?? "All Projects";
  }

  const summary = buildReportSummary({
    date: input.date,
    period: input.period,
    projectId: summaryProjectId,
    projectName,
    projectNames,
    tasks,
    sessions,
  });
  persistReportSnapshot(summary);
  return summary;
}

export function persistReportSnapshot(
  summary: ReportSummary,
  options: PersistReportSnapshotOptions = {},
): PersistReportSnapshotResult {
  const reportsDir = options.reportsDir ?? join(loadConfig().devlogDir, "reports");
  const mkdirSync = options.mkdirSync ?? fsMkdirSync;
  const writeFileSync = options.writeFileSync ?? fsWriteFileSync;
  const filePath = join(reportsDir, getReportSnapshotFileName(summary));

  try {
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
    return { ok: true, path: filePath };
  } catch (error) {
    return {
      ok: false,
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getReportSnapshotFileName(summary: ReportSummary): string {
  const rangeKey = summary.range.startDate === summary.range.endDate
    ? summary.range.startDate
    : `${summary.range.startDate}_to_${summary.range.endDate}`;
  return [
    summary.range.period,
    rangeKey,
    sanitizeSnapshotSegment(summary.projectId),
  ].join("-") + ".json";
}

function sanitizeSnapshotSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}
