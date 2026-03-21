"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, KanbanSquare } from "lucide-react";
import { ConflictAlertBar } from "@/components/dashboard/conflict-alert-bar";
import { TaskQuickView } from "@/components/dashboard/task-quick-view";
import { MetricCard } from "@/components/dashboard/activity-metrics";
import { VelocityChart } from "@/components/dashboard/velocity-chart";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ProjectProgress } from "@/components/dashboard/project-progress";
import { useTasks } from "@/hooks/use-tasks";
import { useLocks } from "@/hooks/use-locks";
import { useTaskAnalytics } from "@/hooks/use-task-analytics";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { tasks, loading, tasksByStatus } = useTasks();
  const { conflicts } = useLocks();
  const analytics = useTaskAnalytics(tasks);

  const conflictFiles = conflicts.map((c) => c.file_path);
  const sparklineData = analytics.dailyVelocity.map((d) => d.completed);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Conflict alert */}
      {conflicts.length > 0 && (
        <ConflictAlertBar
          conflictCount={conflicts.length}
          conflictFiles={conflictFiles}
        />
      )}

      {/* Row 1 — PM Hero Metric Cards */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4 shrink-0">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[130px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 shrink-0">
          {/* Card 1: Completed Today */}
          <MetricCard
            label="Completed Today"
            value={String(analytics.completedToday)}
            unit={analytics.completedToday === 1 ? "task" : "tasks"}
            accent="green"
            sparkline={sparklineData}
            badge={
              analytics.completedThisWeek > 0
                ? { text: `${analytics.completedThisWeek} this week`, tone: "green" }
                : undefined
            }
          />

          {/* Card 2: In Progress */}
          <MetricCard
            label="In Progress"
            value={String(analytics.inProgressTasks.length)}
            unit={analytics.inProgressTasks.length === 1 ? "active" : "active"}
            accent="blue"
            sub={
              analytics.inProgressTasks.length > 0
                ? analytics.inProgressTasks.slice(0, 2).map((t) => ({
                    label: t.worktree_name ?? "main",
                    value: t.title.slice(0, 14) + (t.title.length > 14 ? "…" : ""),
                  }))
                : [{ label: "status", value: "Idle" }]
            }
          />

          {/* Card 3: At Risk */}
          <MetricCard
            label="At Risk"
            value={String(analytics.stuckTasks.length)}
            unit={analytics.stuckTasks.length === 1 ? "stuck task" : "stuck tasks"}
            accent={analytics.stuckTasks.length > 0 ? "red" : "default"}
            badge={
              analytics.stuckTasks.length === 0
                ? { text: "All clear", tone: "green" }
                : { text: "Needs attention", tone: "red" }
            }
            sub={
              analytics.stuckTasks.length > 0
                ? analytics.stuckTasks.slice(0, 2).map((t) => ({
                    label: "stuck 48h+",
                    value: t.title.slice(0, 14) + (t.title.length > 14 ? "…" : ""),
                  }))
                : undefined
            }
          />
        </div>
      )}

      {/* Row 2 — Project Progress Bar */}
      {!loading && analytics.totalTasks > 0 && (
        <div className="shrink-0">
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

      {/* Row 3 — Velocity + Activity Feed */}
      <div className="grid grid-cols-2 gap-4 shrink-0" style={{ minHeight: 220 }}>
        <VelocityChart data={analytics.dailyVelocity} />
        <ActivityFeed activities={analytics.recentActivity} />
      </div>

      {/* Row 4 — Full Task Board */}
      <div className="flex-1 min-h-0 overflow-hidden rounded-xl border bg-card">
        <div className="h-full p-4 flex flex-col">
          <TaskQuickView />
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-2 shrink-0">
        <Link href="/tasks">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Task
          </Button>
        </Link>
        <Link href="/tasks">
          <Button size="sm" variant="outline">
            <KanbanSquare className="h-4 w-4 mr-1" />
            Full Board
          </Button>
        </Link>
      </div>
    </div>
  );
}
