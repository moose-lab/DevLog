"use client";

import { useSessions } from "@/hooks/use-sessions";
import { SessionCard } from "@/components/sessions/session-card";
import { LaunchDialog } from "@/components/sessions/launch-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isActiveSessionStatus } from "@/core/task-readiness";
import { Terminal } from "lucide-react";

export default function SessionsPage() {
  const { sessions, loading, launchSession, controlSession, deleteSession } =
    useSessions();

  const activeSessions = sessions.filter((s) => isActiveSessionStatus(s.status));
  const pastSessions = sessions.filter((s) => !isActiveSessionStatus(s.status));

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-[160px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            {activeSessions.length} active task run
            {activeSessions.length !== 1 ? "s" : ""}, {pastSessions.length} in
            history
          </p>
        </div>
        <LaunchDialog onSubmit={async (data) => {
          const session = await launchSession(data);
          return session ? { id: session.id } : null;
        }} />
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mb-5">
            <Terminal className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">No sessions yet</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
            Each session is an AI agent run for a specific task. Start one to
            watch progress and keep giving instructions until the work is done.
          </p>
          <div className="mt-5">
            <LaunchDialog onSubmit={async (data) => {
              const session = await launchSession(data);
              return session ? { id: session.id } : null;
            }} />
          </div>
        </div>
      ) : (
        <>
          {activeSessions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {activeSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onControl={controlSession}
                    onDelete={deleteSession}
                  />
                ))}
              </div>
            </div>
          )}

          {pastSessions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                History
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {pastSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onControl={controlSession}
                    onDelete={deleteSession}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
