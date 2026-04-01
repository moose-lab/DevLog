"use client";

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/core/dashboard-utils";
import type { RecentActivity } from "@/hooks/use-task-analytics";
import type { Session, Task } from "@/core/types-dashboard";

interface StreamEntry {
  type: "system" | "agent" | "success" | "warning";
  prefix: string;
  text: string;
  time: string;
}

interface CommandStreamProps {
  activities: RecentActivity[];
  sessions: Session[];
  stuckTasks: Task[];
  className?: string;
}

const PREFIX_COLORS: Record<string, string> = {
  system: "text-zinc-400",
  agent: "text-emerald-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
};

const TEXT_COLORS: Record<string, string> = {
  system: "text-zinc-500",
  agent: "text-zinc-400",
  success: "text-emerald-400/80",
  warning: "text-amber-400/80",
};

export function CommandStream({
  activities,
  sessions,
  stuckTasks,
  className,
}: CommandStreamProps) {
  const entries = useMemo(() => {
    const items: StreamEntry[] = [];

    // From recent task activity
    for (const { task } of activities) {
      const branch = task.worktree_name || "main";

      switch (task.status) {
        case "done":
          items.push({
            type: "success",
            prefix: "[SUCCESS]",
            text: `Task '${task.title}' completed`,
            time: task.updated_at,
          });
          break;
        case "in_progress":
          items.push({
            type: "agent",
            prefix: `[AGENT:${branch.toUpperCase().slice(0, 12)}]`,
            text: `Working on: ${task.title}`,
            time: task.updated_at,
          });
          break;
        case "todo":
          items.push({
            type: "system",
            prefix: "[SYSTEM]",
            text: `Task '${task.title}' queued`,
            time: task.updated_at,
          });
          break;
      }
    }

    // Stuck task warnings
    for (const task of stuckTasks) {
      items.push({
        type: "warning",
        prefix: "[WARNING]",
        text: `Task '${task.title}' stuck for 48h+`,
        time: task.updated_at,
      });
    }

    // Running sessions
    for (const session of sessions.filter((s) => s.status === "running")) {
      const name =
        session.branch_name ||
        session.worktree_name ||
        session.id.slice(0, 8);
      items.push({
        type: "agent",
        prefix: `[AGENT:${name.toUpperCase().slice(0, 12)}]`,
        text: "Session active — processing...",
        time: session.started_at,
      });
    }

    // Completed sessions
    for (const session of sessions
      .filter((s) => s.status === "completed")
      .slice(0, 3)) {
      items.push({
        type: "system",
        prefix: "[SYSTEM]",
        text: `Session ${session.id.slice(0, 8)} completed`,
        time: session.ended_at || session.started_at,
      });
    }

    // Sort by time descending
    items.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );

    return items.slice(0, 14);
  }, [activities, sessions, stuckTasks]);

  return (
    <div
      className={cn(
        "glass-card flex flex-col overflow-hidden h-full",
        className
      )}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-300">
            Command Stream
          </span>
        </div>
        <span
          className="text-[10px] text-zinc-600"
          style={{
            fontFamily:
              "var(--font-jetbrains), var(--font-geist-mono), monospace",
          }}
        >
          Live_Feed
        </span>
      </div>

      {/* Terminal body */}
      <ScrollArea className="flex-1 px-5 pb-2 min-h-0">
        {entries.length === 0 ? (
          <p
            className="text-xs text-zinc-600 py-4"
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            Awaiting events...
          </p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry, i) => (
              <p
                key={i}
                className="text-[12px] leading-relaxed"
                style={{
                  fontFamily:
                    "var(--font-jetbrains), var(--font-geist-mono), monospace",
                }}
              >
                <span className={cn("font-bold", PREFIX_COLORS[entry.type])}>
                  {entry.prefix}
                </span>{" "}
                <span className={TEXT_COLORS[entry.type]}>{entry.text}</span>
              </p>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Command input */}
      <div className="px-5 pb-4 pt-2 shrink-0">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <span
            className="text-emerald-500 text-xs"
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            &gt;
          </span>
          <span
            className="text-xs text-zinc-600"
            style={{
              fontFamily:
                "var(--font-jetbrains), var(--font-geist-mono), monospace",
            }}
          >
            SEND MANUAL COMMAND...
          </span>
        </div>
      </div>
    </div>
  );
}
