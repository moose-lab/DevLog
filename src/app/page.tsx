"use client";

import { useState, useEffect, useMemo } from "react";
import { ConflictAlertBar } from "@/components/dashboard/conflict-alert-bar";
import {
  BuildVelocityCard,
  ActiveSessionsCard,
  AtRiskCard,
} from "@/components/dashboard/activity-metrics";
import { VelocityChart } from "@/components/dashboard/velocity-chart";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ProjectProgress } from "@/components/dashboard/project-progress";
import { CommandStream } from "@/components/dashboard/command-stream";
import { CostCard } from "@/components/dashboard/cost-card";
import { useTasks } from "@/hooks/use-tasks";
import { useLocks } from "@/hooks/use-locks";
import { useTaskAnalytics } from "@/hooks/use-task-analytics";
import { useSessions } from "@/hooks/use-sessions";
import { useDevlog } from "@/hooks/use-devlog";
import { useProjects } from "@/hooks/use-projects";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Live session timer ──────────────────────────────── */
function useSessionTimer(
  sessions: { status: string; started_at: string }[]
) {
  const [elapsed, setElapsed] = useState("--:--:--");

  useEffect(() => {
    const running = sessions.find((s) => s.status === "running");
    if (!running) {
      setElapsed("--:--:--");
      return;
    }

    const update = () => {
      const diff = Date.now() - new Date(running.started_at).getTime();
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [sessions]);

  return elapsed;
}

/* ── Dashboard Page ──────────────────────────────────── */
export default function DashboardPage() {
  const { tasks, loading } = useTasks();
  const { conflicts } = useLocks();
  const analytics = useTaskAnalytics(tasks);
  const { sessions } = useSessions();
  const { stats: devlogStats } = useDevlog();
  const { projects, activeId } = useProjects();

  const elapsed = useSessionTimer(sessions);

  const activeProject = projects.find((p) => p.id === activeId);
  const conflictFiles = conflicts.map((c) => c.file_path);

  // Compute velocity comparison
  const { pctVsLastWeek, dailyCompleted } = useMemo(() => {
    const thisWeek = analytics.dailyVelocity.reduce(
      (s, d) => s + d.completed,
      0
    );
    const lastWeek = analytics.dailyVelocity.reduce(
      (s, d) => s + d.prevCompleted,
      0
    );
    const pct =
      lastWeek > 0
        ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
        : 0;
    return {
      pctVsLastWeek: pct,
      dailyCompleted: analytics.dailyVelocity.map((d) => d.completed),
    };
  }, [analytics.dailyVelocity]);

  // Build ID from latest session
  const buildId =
    sessions.length > 0
      ? `#DL-${sessions[0].id.slice(0, 4).toUpperCase()}`
      : "#DL-0000";

  const monoFont =
    "var(--font-jetbrains), var(--font-geist-mono), monospace";

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Conflict alert */}
      {conflicts.length > 0 && (
        <ConflictAlertBar
          conflictCount={conflicts.length}
          conflictFiles={conflictFiles}
        />
      )}

      {/* ── Header: TASK CENTER ─────────────────────────── */}
      <div
        className="flex items-start justify-between shrink-0 animate-fade-up"
      >
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-zinc-100"
            style={{ fontFamily: monoFont }}
          >
            TASK CENTER
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span
              className="text-[11px] text-zinc-500 uppercase tracking-[0.12em]"
              style={{ fontFamily: monoFont }}
            >
              System Stable // {activeProject?.name || "DevLog"}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-8">
          <div className="text-right">
            <span className="text-[10px] text-zinc-600 uppercase tracking-[0.12em] block font-medium">
              Session Duration
            </span>
            <span
              className="text-lg font-bold text-zinc-200 tabular-nums"
              style={{ fontFamily: monoFont }}
            >
              {elapsed}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-600 uppercase tracking-[0.12em] block font-medium">
              Build ID
            </span>
            <span
              className="text-lg font-bold text-emerald-400 tabular-nums"
              style={{ fontFamily: monoFont }}
            >
              {buildId}
            </span>
          </div>
        </div>
      </div>

      {/* ── Row 1: Three metric cards ───────────────────── */}
      {loading ? (
        <div className="grid grid-cols-[2fr_1.6fr_1fr] gap-4 shrink-0">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[160px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div
          className="grid grid-cols-[2fr_1.6fr_1fr] gap-4 shrink-0 animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          <BuildVelocityCard
            completedThisWeek={analytics.completedThisWeek}
            pctVsLastWeek={pctVsLastWeek}
            dailyCompleted={dailyCompleted}
          />
          <ActiveSessionsCard sessions={sessions} tasks={tasks} />
          <AtRiskCard
            stuckCount={analytics.stuckTasks.length}
            conflictCount={conflicts.length}
          />
        </div>
      )}

      {/* ── Row 2: Project Pulse ─────────────────────────── */}
      {!loading && analytics.totalTasks > 0 && (
        <div
          className="shrink-0 animate-fade-up"
          style={{ animationDelay: "120ms" }}
        >
          <ProjectProgress
            totalTasks={analytics.totalTasks}
            doneTasks={analytics.doneTasks}
            inProgressCount={analytics.inProgressTasks.length}
            progressPct={analytics.progressPct}
            estimatedDaysLeft={analytics.estimatedDaysLeft}
            avgVelocity={analytics.avgVelocity}
          />
        </div>
      )}

      {/* ── Row 3: Bottom two-column section ─────────────── */}
      <div
        className="grid grid-cols-[1.2fr_1fr] gap-4 flex-1 min-h-0 animate-fade-up"
        style={{ animationDelay: "180ms" }}
      >
        {/* Left column: Velocity chart + Activity feed */}
        <div className="flex flex-col gap-4 min-h-0">
          <VelocityChart
            data={analytics.dailyVelocity}
            className="flex-1 min-h-0"
          />
          <ActivityFeed
            activities={analytics.recentActivity}
            className="flex-1 min-h-0"
          />
        </div>

        {/* Right column: Command Stream + Cost card */}
        <div className="flex flex-col gap-4 min-h-0">
          <CommandStream
            activities={analytics.recentActivity}
            sessions={sessions}
            stuckTasks={analytics.stuckTasks}
            className="flex-[1.5] min-h-0"
          />
          <CostCard
            stats={devlogStats}
            totalTasks={analytics.totalTasks}
            doneTasks={analytics.doneTasks}
            className="shrink-0"
          />
        </div>
      </div>
    </div>
  );
}
