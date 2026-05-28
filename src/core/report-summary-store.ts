import {
  mkdirSync as fsMkdirSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
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
  const reportsDir = resolve(options.reportsDir ?? join(loadConfig().devlogDir, "reports"));
  const mkdirSync = options.mkdirSync ?? fsMkdirSync;
  const writeFileSync = options.writeFileSync ?? fsWriteFileSync;
  const filePath = resolve(reportsDir, getReportSnapshotFileName(summary));
  if (!isPathInsideDirectory(reportsDir, filePath)) {
    return {
      ok: false,
      path: filePath,
      error: "Report snapshot path escapes reports directory",
    };
  }

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
  const startDate = formatSnapshotDate(summary.range.startDate);
  const endDate = formatSnapshotDate(summary.range.endDate);
  const rangeKey = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
  return [
    getSnapshotPeriodSegment(summary.range.period),
    rangeKey,
    getProjectSnapshotSegment(summary.projectId),
  ].join("-") + ".json";
}

function getSnapshotPeriodSegment(value: string): string {
  if (value === "daily" || value === "weekly" || value === "monthly") return value;
  return "report";
}

function formatSnapshotDate(value: string): string {
  const parsed = parseSnapshotDate(value);
  if (!parsed) return "unknown-date";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseSnapshotDate(value: string): Date | null {
  if (
    value.length !== 10 ||
    value.charCodeAt(4) !== 45 ||
    value.charCodeAt(7) !== 45
  ) {
    return null;
  }

  const year = parseDateNumber(value, 0, 4);
  const month = parseDateNumber(value, 5, 7);
  const day = parseDateNumber(value, 8, 10);
  if (year == null || month == null || day == null) return null;

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function parseDateNumber(value: string, start: number, end: number): number | null {
  let result = 0;
  for (let index = start; index < end; index += 1) {
    const digit = value.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) return null;
    result = result * 10 + digit;
  }
  return result;
}

function getProjectSnapshotSegment(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "project-unknown";
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `project-${hash}`;
}

function isPathInsideDirectory(root: string, filePath: string): boolean {
  const relativePath = relative(root, filePath);
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
