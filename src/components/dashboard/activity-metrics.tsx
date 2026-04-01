"use client";

import { cn } from "@/core/dashboard-utils";
import { Terminal } from "lucide-react";
import type { Session, Task } from "@/core/types-dashboard";

/* ================================================================
   BUILD VELOCITY CARD
   ================================================================ */

interface BuildVelocityProps {
  completedThisWeek: number;
  pctVsLastWeek: number;
  dailyCompleted: number[];
  className?: string;
}

function MiniBarChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px] h-10">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all duration-500"
          style={{
            height: `${Math.max((v / max) * 100, 6)}%`,
            background:
              v > 0
                ? "linear-gradient(to top, rgba(52,211,153,0.5), rgba(52,211,153,0.9))"
                : "rgba(255,255,255,0.04)",
          }}
        />
      ))}
    </div>
  );
}

export function BuildVelocityCard({
  completedThisWeek,
  pctVsLastWeek,
  dailyCompleted,
  className,
}: BuildVelocityProps) {
  const isPositive = pctVsLastWeek >= 0;

  return (
    <div className={cn("glass-card p-5 flex flex-col justify-between", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
          Build Velocity
        </span>
        {pctVsLastWeek !== 0 && (
          <span
            className={cn(
              "text-[11px] font-bold uppercase tracking-wider",
              isPositive ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {isPositive ? "+" : ""}
            {pctVsLastWeek}% vs LW
          </span>
        )}
      </div>

      {/* Big number */}
      <div className="mt-3">
        <div className="flex items-baseline gap-2.5">
          <span
            className="text-5xl font-bold tabular-nums tracking-tight leading-none text-zinc-100"
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            {completedThisWeek}
          </span>
          <span className="text-sm text-zinc-500 font-semibold uppercase tracking-wider">
            Tasks
          </span>
        </div>
        <span className="text-[10px] text-zinc-600 uppercase tracking-[0.15em] mt-1 block font-medium">
          Completed this week
        </span>
      </div>

      {/* Sparkline bar chart */}
      <div className="mt-4">
        <MiniBarChart values={dailyCompleted} />
      </div>
    </div>
  );
}

/* ================================================================
   ACTIVE SESSIONS CARD
   ================================================================ */

interface ActiveSessionsProps {
  sessions: Session[];
  tasks: Task[];
  className?: string;
}

export function ActiveSessionsCard({
  sessions,
  tasks,
  className,
}: ActiveSessionsProps) {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const activeSessions = sessions
    .filter((s) => ["running", "idle", "pending"].includes(s.status))
    .slice(0, 2);

  return (
    <div className={cn("glass-card p-5 flex flex-col", className)}>
      <span className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
        Active Agents
      </span>

      <div className="flex-1 flex items-center mt-3">
        {activeSessions.length === 0 ? (
          <span className="text-sm text-zinc-600">No active sessions</span>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full">
            {activeSessions.map((session) => {
              const linkedTask = session.task_id
                ? taskMap.get(session.task_id)
                : null;
              return (
                <div
                  key={session.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3.5 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-emerald-400/70" />
                    <span
                      className="text-xs font-semibold text-zinc-300 truncate"
                      style={{
                        fontFamily:
                          "var(--font-jetbrains), var(--font-geist-mono), monospace",
                      }}
                    >
                      {session.branch_name ||
                        session.worktree_name ||
                        session.id.slice(0, 10)}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-[0.12em] truncate">
                    {linkedTask?.title ||
                      session.prompt?.slice(0, 30) ||
                      "Processing..."}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   AT RISK CARD
   ================================================================ */

interface AtRiskProps {
  stuckCount: number;
  conflictCount: number;
  className?: string;
}

export function AtRiskCard({
  stuckCount,
  conflictCount,
  className,
}: AtRiskProps) {
  const hasRisk = stuckCount > 0 || conflictCount > 0;

  return (
    <div
      className={cn(
        "glass-card p-5 flex flex-col justify-between",
        hasRisk && "!border-rose-500/25",
        className
      )}
    >
      <span
        className={cn(
          "text-[11px] uppercase tracking-[0.15em] font-bold",
          hasRisk ? "text-rose-400" : "text-emerald-400"
        )}
      >
        {hasRisk ? "At Risk" : "All Clear"}
      </span>

      <div className="mt-4 space-y-3">
        {/* Stuck Tasks */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 uppercase tracking-[0.12em] font-medium">
            Stuck Tasks
          </span>
          <span
            className={cn(
              "text-[11px] font-bold tabular-nums px-2.5 py-1 rounded-md",
              stuckCount > 0
                ? "bg-rose-500/15 text-rose-400"
                : "bg-white/[0.06] text-zinc-500"
            )}
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            {String(stuckCount).padStart(2, "0")}
          </span>
        </div>

        {/* Conflicts */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 uppercase tracking-[0.12em] font-medium">
            Conflicts
          </span>
          <span
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wider",
              conflictCount > 0 ? "text-rose-400" : "text-zinc-500"
            )}
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            {conflictCount > 0
              ? `${conflictCount} ${conflictCount === 1 ? "FILE" : "FILES"}`
              : "NONE"}
          </span>
        </div>
      </div>
    </div>
  );
}
