import type {
  Session,
  SessionStatus,
  Task,
  TaskStatus,
} from "./types-dashboard";

export type ReportTask = Task;
export type ReportSession = Session;
export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface ReportRange {
  period: ReportPeriod;
  startDate: string;
  endDate: string;
  label: string;
}

export interface ReportTaskItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Task["priority"];
  updatedAt: string;
  completedAt: string | null;
  failReason: string | null;
  sessionId: string | null;
}

export interface ReportSessionItem {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  status: SessionStatus;
  promptPreview: string | null;
  startedAt: string;
  endedAt: string | null;
  runtimeMinutes: number | null;
}

export interface ReportMetrics {
  totalTasks: number;
  doneTasks: number;
  projectProgressRate: number;
  touchedTasks: number;
  completedInPeriod: number;
  completionRate: number;
  reviewTasks: number;
  activeTasks: number;
  blockedTasks: number;
  failedTasks: number;
  sessions: number;
  completedSessions: number;
  activeSessions: number;
  failedSessions: number;
  runtimeMinutes: number;
}

export interface ReportProjectBreakdown {
  projectId: string;
  projectName: string;
  touchedTasks: number;
  completedTasks: number;
  reviewTasks: number;
  activeTasks: number;
  blockedTasks: number;
  sessions: number;
  runtimeMinutes: number;
}

export interface ReportSummary {
  date: string;
  range: ReportRange;
  projectId: string;
  projectName: string;
  generatedAt: string;
  metrics: ReportMetrics;
  highlights: string[];
  projectBreakdown: ReportProjectBreakdown[];
  sections: {
    completed: ReportTaskItem[];
    review: ReportTaskItem[];
    active: ReportTaskItem[];
    blocked: ReportTaskItem[];
  };
  sessions: ReportSessionItem[];
}

interface BuildReportSummaryInput {
  date: string;
  period?: ReportPeriod;
  projectId: string;
  projectName: string;
  projectNames?: Map<string, string>;
  tasks: ReportTask[];
  sessions: ReportSession[];
  generatedAt?: string;
}

const ACTIVE_TASK_STATUSES = new Set<TaskStatus>([
  "todo",
  "in_queue",
  "in_progress",
]);
const BLOCKED_TASK_STATUSES = new Set<TaskStatus>(["blocked", "fail"]);
const ACTIVE_SESSION_STATUSES = new Set<SessionStatus>([
  "pending",
  "running",
  "idle",
  "paused",
]);

export function getTodayDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeReportDate(value: string | null): string | null {
  if (value == null || value.trim() === "") return getTodayDateKey();

  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const parsed = parseDate(`${date} 00:00:00`);
  if (!parsed) return null;
  return getTodayDateKey(parsed) === date ? date : null;
}

export function normalizeReportPeriod(value: string | null): ReportPeriod | null {
  if (value == null || value.trim() === "") return "daily";
  if (value === "daily" || value === "weekly" || value === "monthly") return value;
  return null;
}

export function buildReportRange(
  period: string,
  date: string,
): ReportRange | null {
  const normalizedPeriod = normalizeReportPeriod(period);
  if (!normalizedPeriod) return null;
  const parsed = parseDate(`${date} 00:00:00`);
  if (!parsed) return null;

  if (normalizedPeriod === "daily") {
    return {
      period: normalizedPeriod,
      startDate: date,
      endDate: date,
      label: "Daily Report",
    };
  }

  if (normalizedPeriod === "weekly") {
    const start = new Date(parsed);
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      period: normalizedPeriod,
      startDate: getTodayDateKey(start),
      endDate: getTodayDateKey(end),
      label: "Weekly Report",
    };
  }

  const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  const end = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
  return {
    period: normalizedPeriod,
    startDate: getTodayDateKey(start),
    endDate: getTodayDateKey(end),
    label: "Monthly Report",
  };
}

export function buildReportSummary(input: BuildReportSummaryInput): ReportSummary {
  const range = buildReportRange(input.period ?? "daily", input.date);
  if (!range) {
    throw new Error(`Invalid report period: ${input.period ?? "daily"}`);
  }
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const touchedTasks = input.tasks.filter((task) => taskTouchedInRange(task, range));
  const completedTasks = touchedTasks.filter(
    (task) => task.status === "done" && dateInRange(task.completed_at, range),
  );
  const reviewTasks = touchedTasks.filter((task) => task.status === "review");
  const activeTasks = touchedTasks.filter((task) =>
    ACTIVE_TASK_STATUSES.has(task.status),
  );
  const blockedTasks = touchedTasks.filter((task) =>
    BLOCKED_TASK_STATUSES.has(task.status),
  );
  const dailySessions = input.sessions
    .filter((session) => sessionTouchedInRange(session, range))
    .sort((a, b) => compareDateStrings(a.started_at, b.started_at));

  const doneTasks = input.tasks.filter((task) => task.status === "done").length;
  const totalTasks = input.tasks.length;
  const runtimeMinutes = dailySessions.reduce(
    (sum, session) => sum + (sessionRuntimeMinutes(session) ?? 0),
    0,
  );

  const metrics: ReportMetrics = {
    totalTasks,
    doneTasks,
    projectProgressRate: percentage(doneTasks, totalTasks),
    touchedTasks: touchedTasks.length,
    completedInPeriod: completedTasks.length,
    completionRate: percentage(completedTasks.length, touchedTasks.length),
    reviewTasks: reviewTasks.length,
    activeTasks: activeTasks.length,
    blockedTasks: blockedTasks.filter((task) => task.status === "blocked").length,
    failedTasks: blockedTasks.filter((task) => task.status === "fail").length,
    sessions: dailySessions.length,
    completedSessions: dailySessions.filter((session) => session.status === "completed").length,
    activeSessions: dailySessions.filter((session) =>
      ACTIVE_SESSION_STATUSES.has(session.status),
    ).length,
    failedSessions: dailySessions.filter((session) => session.status === "failed").length,
    runtimeMinutes,
  };

  return {
    date: input.date,
    range,
    projectId: input.projectId,
    projectName: input.projectName,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    metrics,
    highlights: buildHighlights(metrics),
    projectBreakdown: buildProjectBreakdown({
      tasks: touchedTasks,
      sessions: dailySessions,
      projectNames: input.projectNames ?? new Map([[input.projectId, input.projectName]]),
    }),
    sections: {
      completed: completedTasks.map(toTaskItem),
      review: reviewTasks.map(toTaskItem),
      active: activeTasks.map(toTaskItem),
      blocked: blockedTasks.map(toTaskItem),
    },
    sessions: dailySessions.map((session) => toSessionItem(session, taskById)),
  };
}

export function renderReportHtml(summary: ReportSummary): string {
  const title = `${summary.range.label} - ${summary.projectName} - ${summary.range.startDate}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f7f8; color: #18181b; }
    main { max-width: 1080px; margin: 0 auto; padding: 40px 24px; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #e4e4e7; padding-bottom: 20px; }
    h1 { margin: 0; font-size: 30px; line-height: 1.15; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    h3 { margin: 0; font-size: 15px; }
    p { margin: 0; }
    .muted { color: #71717a; }
    .date { text-align: right; font-size: 14px; color: #52525b; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
    .metric, .section { border: 1px solid #e4e4e7; border-radius: 8px; background: #fff; padding: 16px; }
    .metric strong { display: block; font-size: 26px; line-height: 1; margin-top: 8px; }
    .section { margin-top: 16px; }
    .highlight-list, .task-list, .session-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .highlight-list li, .task, .session { border: 1px solid #ececef; border-radius: 8px; padding: 12px; background: #fafafa; }
    .task-title, .session-title { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
    .meta { margin-top: 6px; font-size: 13px; color: #71717a; }
    .badge { display: inline-flex; align-items: center; border: 1px solid #d4d4d8; border-radius: 999px; padding: 2px 8px; font-size: 12px; color: #3f3f46; white-space: nowrap; }
    .empty { color: #71717a; font-size: 14px; }
    @media (max-width: 760px) {
      main { padding: 24px 14px; }
      header { display: block; }
      .date { text-align: left; margin-top: 12px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="muted">DevLog</p>
        <h1>${escapeHtml(summary.range.label)}</h1>
        <p class="muted">${escapeHtml(summary.projectName)}</p>
      </div>
      <div class="date">
        <p>${escapeHtml(rangeLabel(summary.range))}</p>
        <p>Generated ${escapeHtml(formatDateTime(summary.generatedAt))}</p>
      </div>
    </header>

    <section class="grid" aria-label="Report metrics">
      ${metricHtml("Completion", `${summary.metrics.completionRate}%`, `${summary.metrics.completedInPeriod} done of ${summary.metrics.touchedTasks} touched`)}
      ${metricHtml("Project Progress", `${summary.metrics.projectProgressRate}%`, `${summary.metrics.doneTasks} done of ${summary.metrics.totalTasks} total`)}
      ${metricHtml("Sessions", String(summary.metrics.sessions), `${summary.metrics.completedSessions} completed`)}
      ${metricHtml("Focus Time", formatMinutes(summary.metrics.runtimeMinutes), "Completed session runtime")}
    </section>

    ${sectionHtml("Highlights", summary.highlights.map((text) => `<li>${escapeHtml(text)}</li>`).join(""), "highlight-list")}
    ${projectBreakdownHtml(summary.projectBreakdown)}
    ${taskSectionHtml("Completed Work", summary.sections.completed)}
    ${taskSectionHtml("In Review", summary.sections.review)}
    ${taskSectionHtml("Active / In Progress", summary.sections.active)}
    ${taskSectionHtml("Blocked / Failed", summary.sections.blocked)}
    ${sessionSectionHtml(summary.sessions)}
  </main>
</body>
</html>`;
}

function buildHighlights(metrics: ReportMetrics): string[] {
  if (metrics.touchedTasks === 0 && metrics.sessions === 0) {
    return ["No work was recorded for this period."];
  }

  const highlights = [
    `Completed ${plural(metrics.completedInPeriod, "task")} and moved ${plural(metrics.reviewTasks, "task")} into review.`,
    `Touched ${plural(metrics.touchedTasks, "task")} across ${plural(metrics.sessions, "session")}.`,
    `Project progress is ${metrics.projectProgressRate}% with ${metrics.doneTasks} of ${metrics.totalTasks} tasks done.`,
  ];

  const attentionCount = metrics.blockedTasks + metrics.failedTasks + metrics.failedSessions;
  if (attentionCount > 0) {
    highlights.push(`${plural(attentionCount, "item")} need attention before they can count as finished work.`);
  }

  return highlights;
}

function taskTouchedInRange(task: ReportTask, range: ReportRange): boolean {
  return dateInRange(task.updated_at, range) || dateInRange(task.completed_at, range);
}

function sessionTouchedInRange(session: ReportSession, range: ReportRange): boolean {
  return dateInRange(session.started_at, range) || dateInRange(session.ended_at, range);
}

function dateInRange(value: string | null | undefined, range: ReportRange): boolean {
  const key = dateKey(value);
  return Boolean(key && key >= range.startDate && key <= range.endDate);
}

function buildProjectBreakdown(input: {
  tasks: ReportTask[];
  sessions: ReportSession[];
  projectNames: Map<string, string>;
}): ReportProjectBreakdown[] {
  const rows = new Map<string, ReportProjectBreakdown>();
  const getRow = (projectId: string) => {
    const existing = rows.get(projectId);
    if (existing) return existing;
    const row: ReportProjectBreakdown = {
      projectId,
      projectName: input.projectNames.get(projectId) ?? projectId,
      touchedTasks: 0,
      completedTasks: 0,
      reviewTasks: 0,
      activeTasks: 0,
      blockedTasks: 0,
      sessions: 0,
      runtimeMinutes: 0,
    };
    rows.set(projectId, row);
    return row;
  };

  for (const task of input.tasks) {
    const row = getRow(task.project_id);
    row.touchedTasks++;
    if (task.status === "done") row.completedTasks++;
    if (task.status === "review") row.reviewTasks++;
    if (ACTIVE_TASK_STATUSES.has(task.status)) row.activeTasks++;
    if (BLOCKED_TASK_STATUSES.has(task.status)) row.blockedTasks++;
  }

  for (const session of input.sessions) {
    const row = getRow(session.project_id);
    row.sessions++;
    row.runtimeMinutes += sessionRuntimeMinutes(session) ?? 0;
  }

  return [...rows.values()].sort((a, b) => {
    const activityDelta = b.touchedTasks + b.sessions - (a.touchedTasks + a.sessions);
    return activityDelta || a.projectName.localeCompare(b.projectName);
  });
}

function toTaskItem(task: ReportTask): ReportTaskItem {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    failReason: task.fail_reason ?? null,
    sessionId: task.session_id,
  };
}

function toSessionItem(
  session: ReportSession,
  taskById: Map<string, ReportTask>,
): ReportSessionItem {
  const task = session.task_id ? taskById.get(session.task_id) : null;
  return {
    id: session.id,
    taskId: session.task_id,
    taskTitle: task?.title ?? null,
    status: session.status,
    promptPreview: previewText(session.prompt),
    startedAt: session.started_at,
    endedAt: session.ended_at,
    runtimeMinutes: sessionRuntimeMinutes(session),
  };
}

function sessionRuntimeMinutes(session: ReportSession): number | null {
  if (!session.ended_at) return null;
  const started = parseDate(session.started_at);
  const ended = parseDate(session.ended_at);
  if (!started || !ended) return null;
  return Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60_000));
}

function dateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function parseDate(value: string): Date | null {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareDateStrings(a: string, b: string): number {
  const left = parseDate(a)?.getTime() ?? 0;
  const right = parseDate(b)?.getTime() ?? 0;
  return left - right;
}

function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function previewText(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function metricHtml(label: string, value: string, detail: string): string {
  return `<div class="metric"><p class="muted">${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><p class="meta">${escapeHtml(detail)}</p></div>`;
}

function sectionHtml(title: string, body: string, listClass: string): string {
  return `<section class="section"><h2>${escapeHtml(title)}</h2><ul class="${listClass}">${body}</ul></section>`;
}

function taskSectionHtml(title: string, tasks: ReportTaskItem[]): string {
  if (tasks.length === 0) {
    return `<section class="section"><h2>${escapeHtml(title)}</h2><p class="empty">No items.</p></section>`;
  }

  const body = tasks.map((task) => {
    const detail = task.description || task.failReason || `Updated ${formatDateTime(task.updatedAt)}`;
    return `<li class="task">
      <div class="task-title"><span>${escapeHtml(task.title)}</span><span class="badge">${escapeHtml(statusLabel(task.status))}</span></div>
      <p class="meta">${escapeHtml(detail)}</p>
    </li>`;
  }).join("");

  return sectionHtml(title, body, "task-list");
}

function projectBreakdownHtml(projects: ReportProjectBreakdown[]): string {
  if (projects.length === 0) {
    return `<section class="section"><h2>Project Breakdown</h2><p class="empty">No project activity recorded.</p></section>`;
  }

  const body = projects.map((project) => (
    `<li class="task">
      <div class="task-title"><span>${escapeHtml(project.projectName)}</span><span class="badge">${escapeHtml(formatMinutes(project.runtimeMinutes))}</span></div>
      <p class="meta">${escapeHtml(`${project.completedTasks} completed, ${project.reviewTasks} in review, ${project.activeTasks} active, ${project.blockedTasks} blocked/failed, ${project.sessions} sessions`)}</p>
    </li>`
  )).join("");

  return sectionHtml("Project Breakdown", body, "task-list");
}

function sessionSectionHtml(sessions: ReportSessionItem[]): string {
  if (sessions.length === 0) {
    return `<section class="section"><h2>Session Timeline</h2><p class="empty">No sessions recorded.</p></section>`;
  }

  const body = sessions.map((session) => {
    const title = session.taskTitle || session.promptPreview || session.id;
    const detail = [
      formatDateTime(session.startedAt),
      session.runtimeMinutes == null ? null : formatMinutes(session.runtimeMinutes),
      session.promptPreview,
    ].filter(Boolean).join(" | ");

    return `<li class="session">
      <div class="session-title"><span>${escapeHtml(title)}</span><span class="badge">${escapeHtml(statusLabel(session.status))}</span></div>
      <p class="meta">${escapeHtml(detail)}</p>
    </li>`;
  }).join("");

  return sectionHtml("Session Timeline", body, "session-list");
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function rangeLabel(range: ReportRange): string {
  return range.startDate === range.endDate
    ? range.startDate
    : `${range.startDate} to ${range.endDate}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatDateTime(value: string): string {
  const date = parseDate(value);
  if (!date) return value;
  return date.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
