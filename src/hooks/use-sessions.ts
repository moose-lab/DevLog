"use client";

import type { Session } from "@/core/types-dashboard";
import type { SessionRuntimeAuthInput } from "@/core/session-runtime-auth";
import type { ChatStreamEvent } from "@/core/stream-manager";
import { usePolledJson } from "./use-polled-json";
import { useGlobalStreamEvent } from "./use-global-stream";

function shouldRefreshSessionsForEvent(event: ChatStreamEvent): boolean {
  return (
    event.type === "control_plane_stage" ||
    event.type === "control_plane_gate" ||
    event.type === "control_plane_gate_resolved"
  );
}

export function useSessions() {
  const { data, loading, error, refresh } = usePolledJson<Session[]>("/api/sessions", 5000);
  const sessions = data ?? [];
  const fetchSessions = refresh;

  useGlobalStreamEvent((event) => {
    if (shouldRefreshSessionsForEvent(event)) {
      void fetchSessions();
    }
  });

  const launchSession = async (data: {
    task_id?: string;
    worktree_name?: string;
    worktree_path: string;
    branch_name?: string;
    prompt: string;
    coding_agent_id?: string;
    agent_team_id?: string;
  } & SessionRuntimeAuthInput): Promise<Session | null> => {
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

  const controlSession = async (id: string, action: "kill" | "pause" | "end") => {
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

  return { sessions, loading, error, launchSession, controlSession, deleteSession, refresh: fetchSessions };
}
