"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  ListChecks,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ReportSummary,
  ReportProjectBreakdown,
  ReportSessionItem,
  ReportTaskItem,
  ReportPeriod,
} from "@/core/report-summary";

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export default function ReportsPage() {
  const [date, setDate] = useState(() => todayKey());
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports?date=${encodeURIComponent(date)}&period=${period}`,
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load report");
        setSummary(null);
        return;
      }
      setSummary(payload as ReportSummary);
    } catch (err) {
      setError((err as Error).message);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [date, period]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const exportHref = useMemo(
    () => `/api/reports/export?date=${encodeURIComponent(date)}&period=${period}`,
    [date, period],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Analytics
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary ? `${summary.range.label} across ${summary.projectName}` : "Work output reports."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={period} onValueChange={(value) => setPeriod(value as ReportPeriod)}>
            <TabsList>
              {PERIODS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-8 w-[152px]"
              aria-label="Report date"
            />
          </label>
          <Button variant="outline" size="sm" onClick={() => void fetchSummary()} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <a href={exportHref}>
              <Download className="h-4 w-4" />
              Export HTML
            </a>
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <ReportSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-6">
            <div>
              <p className="text-sm font-medium">Report unavailable</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void fetchSummary()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : summary ? (
        <ReportsContent summary={summary} />
      ) : null}
    </div>
  );
}

function ReportsContent({ summary }: { summary: ReportSummary }) {
  const hasWork = summary.metrics.touchedTasks > 0 || summary.metrics.sessions > 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Completion"
          value={`${summary.metrics.completionRate}%`}
          detail={`${summary.metrics.completedInPeriod} done of ${summary.metrics.touchedTasks} touched`}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Project Progress"
          value={`${summary.metrics.projectProgressRate}%`}
          detail={`${summary.metrics.doneTasks} done of ${summary.metrics.totalTasks} total`}
          icon={Activity}
        />
        <MetricCard
          label="Tasks Touched"
          value={String(summary.metrics.touchedTasks)}
          detail={`${summary.metrics.reviewTasks} in review, ${summary.metrics.blockedTasks + summary.metrics.failedTasks} blocked or failed`}
          icon={ListChecks}
        />
        <MetricCard
          label="Focus Time"
          value={formatMinutes(summary.metrics.runtimeMinutes)}
          detail={`${summary.metrics.sessions} sessions, ${summary.metrics.completedSessions} completed`}
          icon={Clock3}
        />
      </div>

      {!hasWork && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">No work recorded for this period</p>
              <p className="text-xs text-muted-foreground">
                Start from a task or inspect recent sessions.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/tasks">View Tasks</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/sessions">View Sessions</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {summary.highlights.map((highlight) => (
              <li
                key={highlight}
                className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                {highlight}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ProjectBreakdown projects={summary.projectBreakdown} />

      <div className="grid gap-4 xl:grid-cols-2">
        <TaskSection title="Completed Work" tasks={summary.sections.completed} />
        <TaskSection title="In Review" tasks={summary.sections.review} />
        <TaskSection title="Active / In Progress" tasks={summary.sections.active} />
        <TaskSection title="Blocked / Failed" tasks={summary.sections.blocked} />
      </div>

      <SessionTimeline sessions={summary.sessions} />
    </div>
  );
}

function ProjectBreakdown({
  projects,
}: {
  projects: ReportProjectBreakdown[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Project Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No project activity recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Review</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Runtime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.projectId}>
                  <TableCell className="font-medium">{project.projectName}</TableCell>
                  <TableCell className="text-right tabular-nums">{project.completedTasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{project.reviewTasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{project.activeTasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{project.blockedTasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{project.sessions}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMinutes(project.runtimeMinutes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function TaskSection({
  title,
  tasks,
}: {
  title: string;
  tasks: ReportTaskItem[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {task.description || task.failReason || `Updated ${formatDateTime(task.updatedAt)}`}
                    </p>
                  </div>
                  <Badge variant="outline">{statusLabel(task.status)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SessionTimeline({ sessions }: { sessions: ReportSessionItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Session Timeline</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Runtime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="max-w-[420px]">
                    <Link href={`/sessions/${session.id}`} className="font-medium hover:underline">
                      {session.taskTitle || session.id}
                    </Link>
                    {session.promptPreview && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {session.promptPreview}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{statusLabel(session.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(session.startedAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {session.runtimeMinutes == null ? "--" : formatMinutes(session.runtimeMinutes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-[132px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[140px] rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-[220px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function todayKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function formatDateTime(value: string): string {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
