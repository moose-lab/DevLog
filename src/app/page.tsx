"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Terminal,
  KanbanSquare,
  GitBranch,
  DollarSign,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import type { Session, Task, Worktree } from "@/lib/types";

interface DashboardData {
  sessions: Session[];
  tasks: Task[];
  worktrees: Worktree[];
  conflicts: { file_path: string; worktree_a: string; worktree_b: string }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sessionsRes, tasksRes, worktreesRes, locksRes] = await Promise.all([
          fetch("/api/sessions"),
          fetch("/api/tasks"),
          fetch("/api/worktrees"),
          fetch("/api/locks"),
        ]);

        const [sessions, tasks, worktrees, locksData] = await Promise.all([
          sessionsRes.ok ? sessionsRes.json() : [],
          tasksRes.ok ? tasksRes.json() : [],
          worktreesRes.ok ? worktreesRes.json() : [],
          locksRes.ok ? locksRes.json() : { locks: [], conflicts: [] },
        ]);

        setData({ sessions, tasks, worktrees, conflicts: locksData.conflicts });
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[100px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-lg" />
      </div>
    );
  }

  const runningSessions = data.sessions.filter((s) => s.status === "running").length;
  const activeTasks = data.tasks.filter((t) => t.status === "in_progress").length;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Running Sessions
            </CardTitle>
            <Terminal className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runningSessions}</div>
            <p className="text-xs text-muted-foreground">
              {data.sessions.length} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Tasks
            </CardTitle>
            <KanbanSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTasks}</div>
            <p className="text-xs text-muted-foreground">
              {data.tasks.length} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Worktrees
            </CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.worktrees.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Conflicts
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.conflicts.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Link href="/sessions">
          <Button size="sm">
            <Rocket className="h-4 w-4 mr-1" />
            Launch Session
          </Button>
        </Link>
        <Link href="/tasks">
          <Button size="sm" variant="outline">
            <KanbanSquare className="h-4 w-4 mr-1" />
            View Board
          </Button>
        </Link>
      </div>

      {/* Recent sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {data.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          ) : (
            <div className="space-y-2">
              {data.sessions.slice(0, 10).map((session) => (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}`}
                  className="flex items-center justify-between rounded-md p-2 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          session.status === "running"
                            ? "bg-green-500"
                            : session.status === "failed"
                              ? "bg-red-500"
                              : "bg-gray-500"
                        }`}
                      />
                    </span>
                    <span className="text-sm truncate">
                      {session.prompt?.slice(0, 60) ?? session.id.slice(0, 12)}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {session.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
