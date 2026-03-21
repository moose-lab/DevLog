"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/core/dashboard-utils";
import type { RecentActivity } from "@/hooks/use-task-analytics";

const STATUS_STYLES: Record<string, { dot: string; label: string; badge: string }> = {
  done: {
    dot: "bg-green-500",
    label: "Completed",
    badge: "text-green-600 bg-green-500/10",
  },
  in_progress: {
    dot: "bg-blue-500 animate-pulse",
    label: "Started",
    badge: "text-blue-500 bg-blue-500/10",
  },
  todo: {
    dot: "bg-slate-400",
    label: "Queued",
    badge: "text-muted-foreground bg-muted",
  },
};

interface ActivityFeedProps {
  activities: RecentActivity[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Recent Activity
        </p>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ScrollArea className="h-[calc(100%-0px)] px-4">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No task activity yet.
            </p>
          ) : (
            <div className="space-y-0.5">
              {activities.map(({ task, label, ago }) => {
                const style = STATUS_STYLES[task.status] ?? STATUS_STYLES.todo;
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0"
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 rounded-full shrink-0",
                        style.dot
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            style.badge
                          )}
                        >
                          {label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {ago}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
