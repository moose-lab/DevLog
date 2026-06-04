"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAgentSettings } from "@/hooks/use-agent-settings";
import type { SessionContinuationRuntimeSnapshot } from "@/core/agent-settings";

export interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; input: Record<string, unknown> }[];
  toolResults?: { name: string; output: string; is_error?: boolean }[];
  costUsd?: number;
  durationMs?: number;
  isQueued?: boolean;
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface SessionActivityEntry {
  id: number;
  kind: "status" | "system" | "log";
  level?: "info" | "success" | "warning" | "error";
  stream?: "stdout" | "stderr";
  message: string;
  timestamp?: string;
}

interface StreamEvent {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
  role?: string;
  content?: string;
  tool_calls?: { name: string; input: Record<string, unknown> }[];
  cost_usd?: number;
  duration_ms?: number;
  status?: string;
  message?: string;
  session_id?: string;
  stream?: "stdout" | "stderr";
  chunk?: string;
  timestamp?: string;
  level?: "info" | "success" | "warning" | "error";
  pid?: number;
  started_at?: string;
  ended_at?: string;
  // Permission events
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  request_id?: string;
  approved?: boolean;
  // Queue events
  position?: number;
  remaining?: number;
}

let _idCounter = 0;
function nextId(): number {
  return ++_idCounter;
}

const ACTIVITY_ENTRY_LIMIT = 100;

function capActivityEntries(
  entries: SessionActivityEntry[],
): SessionActivityEntry[] {
  return entries.slice(Math.max(0, entries.length - ACTIVITY_ENTRY_LIMIT));
}

function withActivityId(
  entry: Omit<SessionActivityEntry, "id">,
): SessionActivityEntry {
  return {
    id: nextId(),
    ...entry,
  };
}

function getStatusActivityMessage(data: StreamEvent): string {
  const status = data.status ?? "idle";
  if (status === "running" && data.pid) {
    return `Agent process running as PID ${data.pid}`;
  }

  if (data.message) {
    return data.message;
  }

  switch (status) {
    case "running":
      return "Agent process running";
    case "completed":
      return "Agent process completed";
    case "failed":
      return "Agent process failed";
    case "killed":
      return "Agent process killed";
    case "paused":
      return "Agent process paused";
    case "idle":
      return "Agent process idle";
    default:
      return `Session status: ${status}`;
  }
}

function getStatusActivityLevel(status: string | undefined): SessionActivityEntry["level"] {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "killed":
    case "paused":
      return "warning";
    default:
      return "info";
  }
}

function getActivityEntryFromEvent(
  data: StreamEvent,
): Omit<SessionActivityEntry, "id"> | null {
  switch (data.type) {
    case "status": {
      const status = data.status ?? "idle";
      return {
        kind: "status",
        level: getStatusActivityLevel(status),
        message: getStatusActivityMessage(data),
        timestamp: data.timestamp ?? data.started_at ?? data.ended_at,
      };
    }
    case "log":
      if (!data.chunk) return null;
      return {
        kind: "log",
        stream: data.stream,
        message: data.chunk,
        timestamp: data.timestamp,
      };
    case "system_log":
      if (!data.message) return null;
      return {
        kind: "system",
        level: data.level ?? "info",
        message: data.message,
        timestamp: data.timestamp,
      };
    default:
      return null;
  }
}

export function mergeReplayMessagesWithQueuedPlaceholders(
  replayMessages: ChatMsg[],
  currentMessages: ChatMsg[],
): ChatMsg[] {
  const replayedUserContentCounts = new Map<string, number>();
  for (const message of replayMessages) {
    if (message.role !== "user") continue;
    replayedUserContentCounts.set(
      message.content,
      (replayedUserContentCounts.get(message.content) ?? 0) + 1,
    );
  }

  return [
    ...replayMessages,
    ...currentMessages.filter((message) => {
      if (!message.isQueued) return false;

      const replayedCount = replayedUserContentCounts.get(message.content) ?? 0;
      if (replayedCount === 0) return true;

      if (replayedCount === 1) {
        replayedUserContentCounts.delete(message.content);
      } else {
        replayedUserContentCounts.set(message.content, replayedCount - 1);
      }
      return false;
    }),
  ];
}

export function useSessionChat(
  sessionId: string | null,
  sessionRuntime?: SessionContinuationRuntimeSnapshot,
) {
  const {
    runtimePayload,
    settingsReady,
    loaded,
    getRuntimePayloadForSession,
    isRuntimeReadyForSession,
  } = useAgentSettings();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTools, setStreamingTools] = useState<
    { name: string; input: Record<string, unknown> }[]
  >([]);
  const [streamingToolResults, setStreamingToolResults] = useState<
    { name: string; output: string; is_error?: boolean }[]
  >([]);
  const [connected, setConnected] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turnCost, setTurnCost] = useState<number | undefined>();
  const [activityEntries, setActivityEntries] = useState<SessionActivityEntry[]>([]);

  // Interactive session state
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedRef = useRef(false);
  const streamTextRef = useRef("");
  const replayMessagesRef = useRef<ChatMsg[]>([]);
  const replayActivityEntriesRef = useRef<SessionActivityEntry[]>([]);
  // Capture streaming tools in a ref for finalization
  const streamToolsRef = useRef<{ name: string; input: Record<string, unknown> }[]>([]);
  const streamToolResultsRef = useRef<{ name: string; output: string; is_error?: boolean }[]>([]);
  const continuationRuntimePayload = useMemo(
    () =>
      sessionRuntime
        ? getRuntimePayloadForSession(sessionRuntime)
        : runtimePayload,
    [getRuntimePayloadForSession, runtimePayload, sessionRuntime],
  );
  const continuationRuntimeReady = useMemo(
    () =>
      loaded &&
      (sessionRuntime
        ? isRuntimeReadyForSession(sessionRuntime)
        : settingsReady),
    [loaded, settingsReady, isRuntimeReadyForSession, sessionRuntime],
  );

  const appendActivityEntry = useCallback(
    (entry: Omit<SessionActivityEntry, "id">) => {
      setActivityEntries((prev) => capActivityEntries([...prev, withActivityId(entry)]));
    },
    [],
  );

  const updateStatusState = useCallback((data: StreamEvent) => {
    const status = data.status ?? "idle";
    setSessionStatus(status);
    if (status === "running") {
      setProcessing(true);
    } else if (
      status === "idle" ||
      status === "paused" ||
      status === "completed" ||
      status === "failed" ||
      status === "killed"
    ) {
      setProcessing(false);
    }
  }, []);

  const handleActivityEvent = useCallback(
    (data: StreamEvent): boolean => {
      if (data.type === "status") {
        updateStatusState(data);
      }

      const entry = getActivityEntryFromEvent(data);
      if (entry) {
        appendActivityEntry(entry);
        return true;
      }

      return data.type === "status" || data.type === "log" || data.type === "system_log";
    },
    [appendActivityEntry, updateStatusState],
  );

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Connect SSE
  const connect = useCallback(() => {
    if (!sessionId) return;
    clearReconnectTimeout();

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    esRef.current = es;
    syncedRef.current = false;
    replayMessagesRef.current = [];
    replayActivityEntriesRef.current = [];

    es.onopen = () => {
      if (esRef.current !== es) return;
      setConnected(true);
    };

    es.onmessage = (evt) => {
      if (esRef.current !== es) return;

      try {
        const data = JSON.parse(evt.data) as StreamEvent;

        // Sync marker — replay complete
        if (data.type === "sync") {
          setMessages((prev) =>
            mergeReplayMessagesWithQueuedPlaceholders(
              replayMessagesRef.current,
              prev,
            ),
          );
          setActivityEntries(capActivityEntries(replayActivityEntriesRef.current));
          syncedRef.current = true;
          return;
        }

        // Replayed events (before sync)
        if (!syncedRef.current) {
          if (data.type === "message") {
            if (data.role && data.content) {
              replayMessagesRef.current = [
                ...replayMessagesRef.current,
                {
                  id: nextId(),
                  role: data.role as "user" | "assistant",
                  content: data.content!,
                },
              ];
            }
            return;
          }

          if (data.type === "status") {
            updateStatusState(data);
          }
          const entry = getActivityEntryFromEvent(data);
          if (entry) {
            replayActivityEntriesRef.current = capActivityEntries([
              ...replayActivityEntriesRef.current,
              withActivityId(entry),
            ]);
          }
          return;
        }

        // Live events (after sync)
        switch (data.type) {
          case "message":
            // User message echo from backend
            if (data.role === "user" && data.content) {
              // Remove any queued placeholder for this message
              setMessages((prev) => {
                const filtered = prev.filter(
                  (m) => !(m.isQueued && m.content === data.content)
                );
                return [
                  ...filtered,
                  { id: nextId(), role: "user", content: data.content! },
                ];
              });
              // Start processing state
              setProcessing(true);
              setStreamingText("");
              setStreamingTools([]);
              setStreamingToolResults([]);
              streamTextRef.current = "";
              streamToolsRef.current = [];
              streamToolResultsRef.current = [];
              setError(null);
            }
            break;

          case "text_delta":
            if (data.text) {
              streamTextRef.current += data.text;
              setStreamingText(streamTextRef.current);
            }
            break;

          case "tool_start":
            if (data.name) {
              const newTool = { name: data.name, input: data.input ?? {} };
              streamToolsRef.current = [...streamToolsRef.current, newTool];
              setStreamingTools(streamToolsRef.current);
              appendActivityEntry({
                kind: "system",
                level: "info",
                message: `Started tool ${data.name}`,
                timestamp: data.timestamp,
              });
            }
            break;

          case "tool_result":
            if (data.name) {
              const newResult = {
                name: data.name,
                output: data.output ?? "",
                is_error: data.is_error,
              };
              streamToolResultsRef.current = [...streamToolResultsRef.current, newResult];
              setStreamingToolResults(streamToolResultsRef.current);
              appendActivityEntry({
                kind: "system",
                level: data.is_error ? "error" : "success",
                message: `Completed tool ${data.name}`,
                timestamp: data.timestamp,
              });
            }
            break;

          case "turn_end": {
            // Finalize the assistant message
            const finalText = streamTextRef.current.trim();
            if (finalText || streamToolsRef.current.length > 0) {
              setMessages((prev) => [
                ...prev,
                {
                  id: nextId(),
                  role: "assistant",
                  content: finalText,
                  toolCalls: [...streamToolsRef.current],
                  toolResults: [...streamToolResultsRef.current],
                  costUsd: data.cost_usd,
                  durationMs: data.duration_ms,
                },
              ]);
            }
            setStreamingText("");
            setStreamingTools([]);
            setStreamingToolResults([]);
            streamTextRef.current = "";
            streamToolsRef.current = [];
            streamToolResultsRef.current = [];
            setProcessing(false);
            setTurnCost(data.cost_usd);
            break;
          }

          // Permission request from Claude
          case "permission_request":
            setPendingPermission({
              requestId: data.request_id!,
              toolName: data.tool_name!,
              toolInput: data.tool_input ?? {},
            });
            break;

          // Permission resolved
          case "permission_resolved":
            setPendingPermission(null);
            break;

          // Message queued (sent during active turn)
          case "message_queued":
            setQueuedCount(data.position ?? 0);
            // Add a queued placeholder message
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: "user",
                content: data.content!,
                isQueued: true,
              },
            ]);
            break;

          // Queue drained
          case "queue_drained":
            setQueuedCount(data.remaining ?? 0);
            break;

          case "error":
            setError(data.message ?? "Unknown error");
            setProcessing(false);
            break;

          case "status":
          case "log":
          case "system_log":
            handleActivityEvent(data);
            break;
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      if (esRef.current !== es) return;
      setConnected(false);
      es.close();
      esRef.current = null;
      clearReconnectTimeout();
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };
  }, [
    appendActivityEntry,
    clearReconnectTimeout,
    handleActivityEvent,
    sessionId,
    updateStatusState,
  ]);

  useEffect(() => {
    setMessages([]);
    setStreamingText("");
    setStreamingTools([]);
    setStreamingToolResults([]);
    setError(null);
    setProcessing(false);
    setActivityEntries([]);
    setPendingPermission(null);
    setQueuedCount(0);
    streamTextRef.current = "";
    streamToolsRef.current = [];
    streamToolResultsRef.current = [];
    replayMessagesRef.current = [];
    replayActivityEntriesRef.current = [];
    syncedRef.current = false;

    connect();
    return () => {
      clearReconnectTimeout();
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [clearReconnectTimeout, connect]);

  // Send a follow-up message — always allowed, queued if processing
  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !content.trim()) return;
      setError(null);
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          message: content.trim(),
          ...continuationRuntimePayload,
        }),
      });
    },
    [continuationRuntimePayload, sessionId]
  );

  // Respond to a permission request
  const respondToPermission = useCallback(
    async (approved: boolean, reason?: string) => {
      if (!sessionId) return;
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "respond_permission",
          approved,
          reason,
        }),
      });
    },
    [sessionId]
  );

  return {
    messages,
    streamingText,
    streamingTools,
    streamingToolResults,
    connected,
    processing,
    sessionStatus,
    error,
    turnCost,
    activityEntries,
    sendMessage,
    byokReady: continuationRuntimeReady,
    // Interactive session features
    pendingPermission,
    respondToPermission,
    queuedCount,
  };
}
