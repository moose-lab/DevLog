"use client";

import dayjs from "dayjs";

interface ProjectProgressProps {
  totalTasks: number;
  doneTasks: number;
  inProgressCount: number;
  progressPct: number;
  estimatedDaysLeft: number | null;
  avgVelocity: number;
}

export function ProjectProgress({
  totalTasks,
  doneTasks,
  inProgressCount,
  progressPct,
  estimatedDaysLeft,
  avgVelocity,
}: ProjectProgressProps) {
  const todoCount = totalTasks - doneTasks - inProgressCount;

  const etaLabel = (() => {
    if (doneTasks === totalTasks && totalTasks > 0) return "All tasks complete 🎉";
    if (estimatedDaysLeft === null || avgVelocity === 0) return "No velocity data yet";
    if (estimatedDaysLeft <= 0) return "On track to finish today";
    const eta = dayjs().add(estimatedDaysLeft, "day").format("MMM D");
    return `At current pace · est. ${eta}`;
  })();

  if (totalTasks === 0) return null;

  return (
    <div className="rounded-xl border bg-card px-5 py-3.5 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase tracking-widest font-medium">Project Progress</span>
        <span>{etaLabel}</span>
      </div>

      {/* Segmented progress bar */}
      <div className="flex h-2 w-full rounded-full overflow-hidden gap-px bg-muted">
        {doneTasks > 0 && (
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
          />
        )}
        {inProgressCount > 0 && (
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${(inProgressCount / totalTasks) * 100}%` }}
          />
        )}
        {todoCount > 0 && (
          <div
            className="bg-muted-foreground/20 transition-all"
            style={{ width: `${(todoCount / totalTasks) * 100}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1.5 text-green-600">
          <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
          {doneTasks} Done
        </span>
        <span className="flex items-center gap-1.5 text-blue-500">
          <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
          {inProgressCount} In Progress
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />
          {todoCount} Todo
        </span>
        <span className="ml-auto font-semibold text-foreground">
          {progressPct}%
        </span>
      </div>
    </div>
  );
}
