"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleCheck, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/core/dashboard-utils";
import type { RecentActivity } from "@/hooks/use-task-analytics";

const STATUS_CONFIG: Record<
  string,
  {
    icon: typeof CircleCheck;
    label: string;
    iconColor: string;
    labelColor: string;
    subtitle: string;
  }
> = {
  done: {
    icon: CircleCheck,
    label: "DONE",
    iconColor: "text-emerald-500/70",
    labelColor: "text-emerald-400",
    subtitle: "COMPLETED",
  },
  in_progress: {
    icon: RefreshCw,
    label: "STARTED",
    iconColor: "text-sky-500/70",
    labelColor: "text-emerald-400",
    subtitle: "IN PROGRESS",
  },
  todo: {
    icon: Clock,
    label: "QUEUED",
    iconColor: "text-zinc-500",
    labelColor: "text-zinc-500",
    subtitle: "ADDED TO QUEUE",
  },
};

interface ActivityFeedProps {
  activities: RecentActivity[];
  className?: string;
}

export function ActivityFeed({ activities, className }: ActivityFeedProps) {
  return (
    <div
      className={cn(
        "glass-card flex flex-col overflow-hidden h-full",
        className
      )}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-2">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-300">
          Recent Activity
        </span>
      </div>

      {/* Activity list */}
      <ScrollArea className="flex-1 px-5 pb-4">
        {activities.length === 0 ? (
          <p className="text-sm text-zinc-600 py-8 text-center">
            No task activity yet.
          </p>
        ) : (
          <div className="space-y-0">
            {activities.map(({ task, ago }) => {
              const config =
                STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo;
              const Icon = config.icon;
              const agentLabel = task.worktree_name
                ? ` BY ${task.worktree_name.toUpperCase()}`
                : "";

              return (
                <div
                  key={task.id}
                  className="flex items-center gap-4 py-3.5 border-b border-white/[0.04] last:border-0 group"
                >
                  {/* Status icon */}
                  <Icon className={cn("h-5 w-5 shrink-0", config.iconColor)} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-300 truncate group-hover:text-zinc-100 transition-colors">
                      {task.title}
                    </p>
                    <p
                      className="text-[10px] text-zinc-600 uppercase tracking-[0.12em] mt-0.5"
                      style={{
                        fontFamily:
                          "var(--font-jetbrains), var(--font-geist-mono), monospace",
                      }}
                    >
                      {config.subtitle}
                      {agentLabel} // {ago.toUpperCase()}
                    </p>
                  </div>

                  {/* Status label */}
                  <span
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-wider shrink-0",
                      config.labelColor
                    )}
                  >
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
