"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/core/dashboard-utils";
import type { RecentActivity } from "@/hooks/use-task-analytics";
import type { Session, Task } from "@/core/types-dashboard";
import type { ChatStreamEvent, SystemLogLevel } from "@/core/stream-manager";
import { useGlobalStreamEvent } from "@/hooks/use-global-stream";

interface StreamEntry {
  type: "system" | "success" | "warning" | "error";
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
  success: "text-emerald-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

const TEXT_COLORS: Record<string, string> = {
  system: "text-zinc-500",
  success: "text-emerald-400/80",
  warning: "text-amber-400/80",
  error: "text-red-400/80",
};

function mapSystemLevelToEntryType(
  level: SystemLogLevel
): StreamEntry["type"] {
  switch (level) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "error";
    case "info":
    default:
      return "system";
  }
}

function formatSystemPrefix(level: SystemLogLevel): string {
  switch (level) {
    case "success":
      return "[SUCCESS]";
    case "warning":
      return "[WARNING]";
    case "error":
      return "[ERROR]";
    case "info":
    default:
      return "[SYSTEM]";
  }
}

export function CommandStream({
  className,
}: CommandStreamProps) {
  const [entries, setEntries] = useState<StreamEntry[]>([]);

  useGlobalStreamEvent((event: ChatStreamEvent) => {
    if (event.type !== "system_log") return;
    const entry: StreamEntry = {
      type: mapSystemLevelToEntryType(event.level),
      prefix: event.prefix ?? formatSystemPrefix(event.level),
      text: event.message,
      time: event.timestamp,
    };

    setEntries((current) => [entry, ...current].slice(0, 20));
  });

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
