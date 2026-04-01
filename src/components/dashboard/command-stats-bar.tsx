"use client";

import { Terminal, KanbanSquare, GitBranch, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Session, Task, Worktree } from "@/core/types-dashboard";

interface CommandStatsBarProps {
  sessions: Session[];
  tasks: Task[];
  worktrees: Worktree[];
  conflictCount: number;
}

export function CommandStatsBar({
  sessions,
  tasks,
  worktrees,
  conflictCount,
}: CommandStatsBarProps) {
  const runningSessions = sessions.filter((s) => s.status === "running").length;
  const activeTasks = tasks.filter((t) => t.status === "in_progress").length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge
        variant="secondary"
        className="gap-1.5 px-3 py-1.5 text-xs font-medium"
      >
        <span
          className={`h-2 w-2 rounded-full ${
            runningSessions > 0 ? "bg-green-500 animate-pulse" : "bg-slate-500"
          }`}
        />
        <Terminal className="h-3 w-3" />
        {runningSessions} running
        <span className="text-muted-foreground">/ {sessions.length} total</span>
      </Badge>

      <Badge
        variant="secondary"
        className="gap-1.5 px-3 py-1.5 text-xs font-medium"
      >
        <KanbanSquare className="h-3 w-3" />
        {activeTasks} active tasks
        <span className="text-muted-foreground">/ {tasks.length} total</span>
      </Badge>

      <Badge
        variant="secondary"
        className="gap-1.5 px-3 py-1.5 text-xs font-medium"
      >
        <GitBranch className="h-3 w-3" />
        {worktrees.length} worktrees
      </Badge>

      {conflictCount > 0 && (
        <Badge
          variant="destructive"
          className="gap-1.5 px-3 py-1.5 text-xs font-medium"
        >
          <AlertTriangle className="h-3 w-3" />
          {conflictCount} conflict{conflictCount !== 1 ? "s" : ""}
        </Badge>
      )}
    </div>
  );
}
