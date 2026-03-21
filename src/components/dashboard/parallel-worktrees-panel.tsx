"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Terminal, AlertTriangle } from "lucide-react";
import type { Worktree, Session } from "@/core/types-dashboard";

interface ParallelWorktreesPanelProps {
  worktrees: Worktree[];
  sessions: Session[];
  conflictFiles: string[];
}

export function ParallelWorktreesPanel({
  worktrees,
  sessions,
  conflictFiles,
}: ParallelWorktreesPanelProps) {
  const conflictSet = new Set(conflictFiles);

  const worktreeSessionCount = (name: string) =>
    sessions.filter((s) => s.worktree_name === name && (s.status === "running" || s.status === "idle")).length;

  const hasConflict = (worktree: Worktree) =>
    conflictFiles.some((f) =>
      f.includes(worktree.name) || conflictSet.size > 0
    );

  if (worktrees.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No worktrees found.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {worktrees.map((wt) => {
        const sessionCount = worktreeSessionCount(wt.name);
        const conflict = hasConflict(wt);

        return (
          <Link key={wt.name} href="/worktrees">
            <Card
              className={`p-3 min-w-[180px] hover:border-primary/30 transition-colors cursor-pointer ${
                conflict ? "border-red-500/50" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium truncate">{wt.branch}</span>
                {conflict && (
                  <AlertTriangle className="h-3 w-3 text-red-500 shrink-0 ml-auto" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground truncate mb-2">{wt.name}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {sessionCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    <Terminal className="h-2.5 w-2.5" />
                    {sessionCount}
                  </Badge>
                )}
                {wt.filesChanged !== undefined && wt.filesChanged > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {wt.filesChanged} changed
                  </Badge>
                )}
                {wt.isMain && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    main
                  </Badge>
                )}
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
