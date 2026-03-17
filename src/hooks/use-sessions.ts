"use client";

import { useState, useEffect, useCallback } from "react";
import type { Session } from "@/core/types-dashboard";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        setSessions(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const launchSession = async (data: {
    task_id?: string;
    worktree_name?: string;
    worktree_path: string;
    branch_name?: string;
    prompt: string;
  }): Promise<Session | null> => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const session = (await res.json()) as Session;
      await fetchSessions();
      return session;
    }
    return null;
  };

  const controlSession = async (id: string, action: "kill" | "end") => {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await fetchSessions();
  };

  const deleteSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    await fetchSessions();
  };

  return { sessions, loading, launchSession, controlSession, deleteSession, refresh: fetchSessions };
}
