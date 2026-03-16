"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

export function useSessionChat(sessionId: string | null) {
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

  // Interactive session state
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const syncedRef = useRef(false);
  const streamTextRef = useRef("");
  // Capture streaming tools in a ref for finalization
  const streamToolsRef = useRef<{ name: string; input: Record<string, unknown> }[]>([]);
  const streamToolResultsRef = useRef<{ name: string; output: string; is_error?: boolean }[]>([]);

  // Connect SSE
  const connect = useCallback(() => {
    if (!sessionId) return;

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    esRef.current = es;
    syncedRef.current = false;

    es.onopen = () => setConnected(true);

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as StreamEvent;

        // Sync marker — replay complete
        if (data.type === "sync") {
          syncedRef.current = true;
          return;
        }

        // Replayed message (before sync)
        if (!syncedRef.current && data.type === "message") {
          if (data.role && data.content) {
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: data.role as "user" | "assistant",
                content: data.content!,
              },
            ]);
          }
          return;
        }

        // Live events (after sync)
        if (!syncedRef.current) return;

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
              const newTool = { name: data.name!, input: data.input ?? {} };
              streamToolsRef.current = [...streamToolsRef.current, newTool];
              setStreamingTools(streamToolsRef.current);
            }
            break;

          case "tool_result":
            if (data.name) {
              const newResult = {
                name: data.name!,
                output: data.output ?? "",
                is_error: data.is_error,
              };
              streamToolResultsRef.current = [...streamToolResultsRef.current, newResult];
              setStreamingToolResults(streamToolResultsRef.current);
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
            setSessionStatus(data.status ?? "idle");
            if (data.status === "running") {
              setProcessing(true);
            } else if (data.status === "idle" || data.status === "completed" || data.status === "killed") {
              setProcessing(false);
            }
            break;
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      setTimeout(connect, 3000);
    };
  }, [sessionId]);

  useEffect(() => {
    setMessages([]);
    setStreamingText("");
    setStreamingTools([]);
    setStreamingToolResults([]);
    setError(null);
    setProcessing(false);
    setPendingPermission(null);
    setQueuedCount(0);
    streamTextRef.current = "";
    streamToolsRef.current = [];
    streamToolResultsRef.current = [];
    syncedRef.current = false;

    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [connect]);

  // Send a follow-up message — always allowed, queued if processing
  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !content.trim()) return;
      setError(null);
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", message: content.trim() }),
      });
    },
    [sessionId]
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
    sendMessage,
    // Interactive session features
    pendingPermission,
    respondToPermission,
    queuedCount,
  };
}
