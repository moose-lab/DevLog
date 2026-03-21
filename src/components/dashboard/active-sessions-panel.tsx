"use client";

import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Terminal } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { Session, Task } from "@/core/types-dashboard";

dayjs.extend(relativeTime);

const STATUS_DOT: Record<string, string> = {
  running: "bg-green-500 animate-pulse",
  idle: "bg-blue-400",
  pending: "bg-yellow-400",
  paused: "bg-yellow-500",
  completed: "bg-slate-400",
  failed: "bg-red-500",
  killed: "bg-red-400",
};

interface ActiveSessionsPanelProps {
  sessions: Session[];
  tasks: Task[];
}

export function ActiveSessionsPanel({ sessions, tasks }: ActiveSessionsPanelProps) {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const sorted = [...sessions].sort((a, b) => {
    const order = ["running", "idle", "pending", "paused", "completed", "failed", "killed"];
    return order.indexOf(a.status) - order.indexOf(b.status);
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Active Sessions</h2>
        <Badge variant="secondary" className="ml-auto text-xs">
          {sessions.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No sessions yet.
          </p>
        ) : (
          <div className="space-y-1 pr-2">
            {sorted.map((session) => {
              const linkedTask = session.task_id ? taskMap.get(session.task_id) : null;
              const elapsed = dayjs(session.started_at).fromNow(true);

              return (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}`}
                  className="flex items-start gap-2.5 rounded-md p-2.5 hover:bg-muted transition-colors group"
                >
                  <span
                    className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                      STATUS_DOT[session.status] ?? "bg-slate-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium truncate leading-tight">
                      {linkedTask?.title ??
                        session.prompt?.slice(0, 50) ??
                        session.id.slice(0, 12)}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {session.status}
                      </Badge>
                      {session.branch_name && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                          {session.branch_name}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                        {elapsed}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
