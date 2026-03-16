"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SessionChat } from "@/components/sessions/session-chat";
import { ProcessIndicator } from "@/components/sessions/process-indicator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Square, Trash2, GitBranch } from "lucide-react";
import type { Session } from "@/lib/types";

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const fetchSession = () => {
      fetch(`/api/sessions/${params.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setSession);
    };
    fetchSession();
    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [params.id]);

  const handleKill = async () => {
    await fetch(`/api/sessions/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kill" }),
    });
  };

  const handleDelete = async () => {
    await fetch(`/api/sessions/${params.id}`, { method: "DELETE" });
    router.push("/sessions");
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading session...</span>
        </div>
      </div>
    );
  }

  const isActive = session.status === "running" || session.status === "idle";
  const isEnded = session.status === "completed" || session.status === "failed" || session.status === "killed";

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-2">
      {/* Compact header */}
      <div className="shrink-0 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/sessions")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium truncate">
            {session.prompt?.slice(0, 120) ?? session.id}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <ProcessIndicator status={session.status} />
            {session.worktree_name && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span>{session.worktree_name}</span>
              </div>
            )}
            {session.branch_name && (
              <Badge variant="secondary" className="text-[10px]">
                {session.branch_name}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={handleKill}>
              <Square className="h-4 w-4" />
            </Button>
          )}
          {isEnded && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Chat fills remaining space */}
      <SessionChat sessionId={params.id} isActive={isActive} />
    </div>
  );
}
