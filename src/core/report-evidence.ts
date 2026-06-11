import type {
  ReportRange,
  ReportSession,
  ReportTask,
} from "./report-summary";
import type { SessionStatus, TaskStatus } from "./types-dashboard";
import { localDateKey, parseDbTimestamp } from "./report-dates";

export type HumanReportSourceType = "task" | "session";
export type HumanReportRiskSeverity = "blocked" | "failed";

export interface HumanReportItem {
  id: string;
  sourceType: HumanReportSourceType;
  sourceId: string;
  title: string;
  detail: string;
  status: TaskStatus | SessionStatus;
}

export interface HumanReportRisk extends HumanReportItem {
  severity: HumanReportRiskSeverity;
  reason: string;
}

export interface HumanReportEvidenceTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: ReportTask["priority"];
  updatedAt: string;
  completedAt: string | null;
  failReason: string | null;
}

export interface HumanReportEvidenceSession {
  id: string;
  taskId: string | null;
  status: SessionStatus;
  promptPreview: string | null;
  startedAt: string;
  endedAt: string | null;
  runtimeMinutes: number | null;
}

export interface HumanReportEvidenceAppendix {
  tasks: HumanReportEvidenceTask[];
  sessions: HumanReportEvidenceSession[];
}

export interface HumanReportEvidence {
  outcomes: HumanReportItem[];
  progress: HumanReportItem[];
  risks: HumanReportRisk[];
  appendix: HumanReportEvidenceAppendix;
}

export interface BuildHumanReportEvidenceInput {
  range: ReportRange;
  tasks: ReportTask[];
  sessions: ReportSession[];
}

const PROGRESS_TASK_STATUSES = new Set<TaskStatus>([
  "todo",
  "in_queue",
  "in_progress",
  "review",
]);

const RISK_TASK_STATUSES = new Set<TaskStatus>(["blocked", "fail"]);

export function buildHumanReportEvidence(
  input: BuildHumanReportEvidenceInput,
): HumanReportEvidence {
  const periodTasks = input.tasks.filter((task) => taskTouchedInRange(task, input.range));
  const periodSessions = input.sessions.filter((session) =>
    sessionTouchedInRange(session, input.range),
  );

  const outcomes = periodTasks
    .filter((task) => task.status === "done")
    .filter((task) => dateInRange(task.completed_at, input.range) || dateInRange(task.updated_at, input.range))
    .map(taskToItem);

  const progress = periodTasks
    .filter((task) => PROGRESS_TASK_STATUSES.has(task.status))
    .map(taskToItem);

  const taskRisks = periodTasks
    .filter((task) => RISK_TASK_STATUSES.has(task.status))
    .map(taskToRisk);

  const sessionRisks = periodSessions
    .filter((session) => session.status === "failed")
    .map(sessionToRisk);

  return {
    outcomes,
    progress,
    risks: [...taskRisks, ...sessionRisks],
    appendix: {
      tasks: periodTasks.map(toAppendixTask),
      sessions: periodSessions.map(toAppendixSession),
    },
  };
}

function taskToItem(task: ReportTask): HumanReportItem {
  return {
    id: `task:${task.id}`,
    sourceType: "task",
    sourceId: task.id,
    title: task.title,
    detail: task.description ?? task.fail_reason ?? `Updated ${task.updated_at}`,
    status: task.status,
  };
}

function taskToRisk(task: ReportTask): HumanReportRisk {
  const severity = task.status === "fail" ? "failed" : "blocked";
  const reason = task.fail_reason ?? task.description ?? `${statusLabel(task.status)} work needs attention.`;

  return {
    ...taskToItem(task),
    severity,
    reason,
  };
}

function sessionToRisk(session: ReportSession): HumanReportRisk {
  const runtime = sessionRuntimeMinutes(session);
  const reason = runtime == null
    ? "Session failed."
    : `Session failed after ${formatMinutes(runtime)}.`;

  return {
    id: `session:${session.id}`,
    sourceType: "session",
    sourceId: session.id,
    title: `Failed session ${session.id}`,
    detail: reason,
    status: session.status,
    severity: "failed",
    reason,
  };
}

function toAppendixTask(task: ReportTask): HumanReportEvidenceTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    failReason: task.fail_reason ?? null,
  };
}

function toAppendixSession(session: ReportSession): HumanReportEvidenceSession {
  return {
    id: session.id,
    taskId: session.task_id,
    status: session.status,
    promptPreview: previewText(session.prompt),
    startedAt: session.started_at,
    endedAt: session.ended_at,
    runtimeMinutes: sessionRuntimeMinutes(session),
  };
}

function taskTouchedInRange(task: ReportTask, range: ReportRange): boolean {
  return dateInRange(task.updated_at, range) || dateInRange(task.completed_at, range);
}

function sessionTouchedInRange(session: ReportSession, range: ReportRange): boolean {
  return dateInRange(session.started_at, range) || dateInRange(session.ended_at, range);
}

function dateInRange(value: string | null | undefined, range: ReportRange): boolean {
  const key = localDateKey(value);
  return Boolean(key && key >= range.startDate && key <= range.endDate);
}

function sessionRuntimeMinutes(session: ReportSession): number | null {
  if (!session.ended_at) return null;
  const started = parseDbTimestamp(session.started_at);
  const ended = parseDbTimestamp(session.ended_at);
  if (!started || !ended) return null;
  return Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60_000));
}

function previewText(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}
