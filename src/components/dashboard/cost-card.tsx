"use client";

import { cn } from "@/core/dashboard-utils";
import type { DevLogStats } from "@/core/types-dashboard";

interface CostCardProps {
  stats: DevLogStats | null;
  totalTasks: number;
  doneTasks: number;
  className?: string;
}

export function CostCard({
  stats,
  totalTasks,
  doneTasks,
  className,
}: CostCardProps) {
  const totalCost = stats?.totalCost ?? 0;
  const costPerTask = doneTasks > 0 ? totalCost / doneTasks : 0;

  return (
    <div className={cn("glass-card p-5", className)}>
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 block">
            Cost-Per-Feature
          </span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-[0.12em] mt-0.5 block font-medium">
            Real-Time Token Spend
          </span>
        </div>
        <span
          className="text-lg font-bold text-zinc-200 tabular-nums"
          style={{
            fontFamily:
              "var(--font-jetbrains), var(--font-geist-mono), monospace",
          }}
        >
          ${costPerTask.toFixed(2)}
          <span className="text-[11px] text-zinc-500">/task</span>
        </span>
      </div>

      {/* Stats rows */}
      <div className="mt-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span
            className="text-zinc-500"
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            Total Spend:
          </span>
          <span
            className="text-zinc-300 font-medium tabular-nums"
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            ${totalCost.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span
            className="text-zinc-500"
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            Sessions:
          </span>
          <span
            className="text-zinc-300 font-medium tabular-nums"
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            {stats?.sessions ?? "--"}
          </span>
        </div>
      </div>
    </div>
  );
}
