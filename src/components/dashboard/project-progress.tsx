"use client";

import { cn } from "@/core/dashboard-utils";

interface ProjectProgressProps {
  totalTasks: number;
  doneTasks: number;
  inProgressCount: number;
  progressPct: number;
  estimatedDaysLeft: number | null;
  avgVelocity: number;
  className?: string;
}

export function ProjectProgress({
  totalTasks,
  doneTasks,
  inProgressCount,
  progressPct,
  className,
}: ProjectProgressProps) {
  const todoCount = totalTasks - doneTasks - inProgressCount;

  if (totalTasks === 0) return null;

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* Header row with legend + percentage */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-300">
            Project Pulse
          </span>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
              <span className="text-zinc-400 font-medium">
                DONE ({doneTasks})
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500 inline-block" />
              <span className="text-zinc-400 font-medium">
                IN PROGRESS ({inProgressCount})
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-600 inline-block" />
              <span className="text-zinc-400 font-medium">
                TODO ({todoCount})
              </span>
            </span>
          </div>
        </div>

        <span
          className="text-2xl font-bold tabular-nums text-emerald-400 metric-glow-green"
          style={{
            fontFamily:
              "var(--font-jetbrains), var(--font-geist-mono), monospace",
          }}
        >
          {progressPct}%
        </span>
      </div>

      {/* Segmented progress bar */}
      <div className="flex h-3 w-full rounded-full overflow-hidden gap-0.5">
        {doneTasks > 0 && (
          <div
            className="bg-emerald-500 rounded-full transition-all duration-1000"
            style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
          />
        )}
        {inProgressCount > 0 && (
          <div
            className="bg-sky-500 rounded-full transition-all duration-1000"
            style={{ width: `${(inProgressCount / totalTasks) * 100}%` }}
          />
        )}
        {todoCount > 0 && (
          <div
            className="bg-zinc-700 rounded-full transition-all duration-1000"
            style={{ width: `${(todoCount / totalTasks) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
