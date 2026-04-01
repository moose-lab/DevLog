"use client";

import { useMemo } from "react";
import { useSessions } from "./use-sessions";
import type { Session } from "@/core/types-dashboard";

/** Returns a Map<task_id, Session> for O(1) lookups on task cards. */
export function useTaskSessions(): Map<string, Session> {
  const { sessions } = useSessions();

  return useMemo(() => {
    const map = new Map<string, Session>();
    for (const session of sessions) {
      if (session.task_id) {
        // Keep the most active session if multiple exist for a task
        const existing = map.get(session.task_id);
        if (!existing || isMoreActive(session, existing)) {
          map.set(session.task_id, session);
        }
      }
    }
    return map;
  }, [sessions]);
}

function isMoreActive(a: Session, b: Session): boolean {
  const priority = ["running", "idle", "pending", "paused", "completed", "failed", "killed"];
  return priority.indexOf(a.status) < priority.indexOf(b.status);
}
