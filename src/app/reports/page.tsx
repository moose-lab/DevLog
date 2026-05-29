"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRightCircle,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ReportSummary,
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
  const report = summary.humanReport;
  const hasWork = report.status.value !== "no_activity";

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">{report.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{report.subtitle}</p>
          </div>
          <Badge variant={report.status.value === "blocked" || report.status.value === "at_risk" ? "destructive" : "outline"}>
            {report.status.label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Executive Summary</p>
            <p className="mt-1 text-sm leading-6">{report.executiveSummary}</p>
          </div>
          <p className="text-xs text-muted-foreground">{report.status.reason}</p>
        </CardContent>
      </Card>

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

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportItemSection
          title="Completed Outcomes"
          items={report.completedOutcomes}
          empty="No completed outcomes recorded."
          icon={CheckCircle2}
        />
        <ReportItemSection
          title="In Progress"
          items={report.inProgress}
          empty="No in-progress work recorded."
          icon={ListChecks}
        />
        <ReportRiskSection risks={report.risksAndBlockers} />
        <ReportItemSection
          title="Next Priorities"
          items={report.nextPriorities}
          empty="No next priorities inferred."
          icon={ArrowRightCircle}
        />
      </div>

      <EvidenceAppendix summary={summary} />
    </div>
  );
}

function ReportItemSection({
  title,
  items,
  empty,
  icon: Icon,
}: {
  title: string;
  items: ReportSummary["humanReport"]["completedOutcomes"];
  empty: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <Badge variant="outline">{statusLabel(item.status)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReportRiskSection({
  risks,
}: {
  risks: ReportSummary["humanReport"]["risksAndBlockers"];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Risks And Blockers</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No risks or blockers recorded.</p>
        ) : (
          <ul className="space-y-2">
            {risks.map((risk) => (
              <li key={risk.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{risk.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{risk.reason}</p>
                  </div>
                  <Badge variant="outline">{risk.severity}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceAppendix({ summary }: { summary: ReportSummary }) {
  const evidence = summary.humanReport.evidence.appendix;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium">Evidence Appendix</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Metrics and raw records kept secondary to the report narrative.
            </p>
          </div>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotMetric
            label="Completion"
            value={`${summary.metrics.completionRate}%`}
            detail={`${summary.metrics.completedInPeriod} done of ${summary.metrics.touchedTasks} touched`}
            icon={CheckCircle2}
          />
          <SnapshotMetric
            label="Project Progress"
            value={`${summary.metrics.projectProgressRate}%`}
            detail={`${summary.metrics.doneTasks} done of ${summary.metrics.totalTasks} total`}
            icon={Activity}
          />
          <SnapshotMetric
            label="Sessions"
            value={String(summary.metrics.sessions)}
            detail={`${summary.metrics.completedSessions} completed`}
            icon={ListChecks}
          />
          <SnapshotMetric
            label="Focus Time"
            value={formatMinutes(summary.metrics.runtimeMinutes)}
            detail="Completed session runtime"
            icon={Clock3}
          />
        </div>

        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Task Evidence</summary>
          {evidence.tasks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No task evidence recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {evidence.tasks.map((task) => (
                <li key={task.id} className="rounded-md bg-muted/30 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{task.title}</p>
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
        </details>

        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Session Evidence</summary>
          {evidence.sessions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No session evidence recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {evidence.sessions.map((session) => (
                <li key={session.id} className="rounded-md bg-muted/30 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{session.id}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {[formatDateTime(session.startedAt), session.runtimeMinutes == null ? null : formatMinutes(session.runtimeMinutes), session.promptPreview]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                    </div>
                    <Badge variant="outline">{statusLabel(session.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </details>
      </CardContent>
    </Card>
  );
}

function SnapshotMetric({
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
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-[176px] rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-[180px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[260px] rounded-xl" />
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
