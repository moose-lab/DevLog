import { getDb } from "./db";
import {
  buildReportSummary,
  type ReportSummary,
  type ReportSession,
  type ReportTask,
  type ReportPeriod,
} from "./report-summary";
import { getProject, listProjects } from "./project-adapter";

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

  const projectNames = Object.fromEntries(
    listProjects().map((project) => [project.id, project.name]),
  );
  const summaryProjectId = projectFilter ?? "all";
  let projectName = "All Projects";
  try {
    if (projectFilter) projectName = getProject(projectFilter).name;
  } catch {
    projectName = projectFilter ?? "All Projects";
  }

  return buildReportSummary({
    date: input.date,
    period: input.period,
    projectId: summaryProjectId,
    projectName,
    projectNames,
    tasks,
    sessions,
  });
}
