"use client";

import { useEffect, useRef } from "react";
import type { ChatStreamEvent } from "@/core/stream-manager";

/**
 * Singleton subscription to /api/devlog/stream (IM-27).
 *
 * The dashboard used to hold three independent EventSource connections to
 * the same endpoint (tasks hook, sessions hook, command stream) — enough to
 * brush against the browser's per-origin HTTP/1.1 connection cap together
 * with the SSE per-session streams. All consumers now share one connection
 * that closes when the last subscriber unmounts.
 */

type Listener = (event: ChatStreamEvent) => void;

let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

const RECONNECT_DELAY_MS = 3000;

function ensureSource(): void {
  if (source) return;
  const es = new EventSource("/api/devlog/stream");
  source = es;
  es.onmessage = (message) => {
    let event: ChatStreamEvent;
    try {
      event = JSON.parse(message.data) as ChatStreamEvent;
    } catch {
      return;
    }
    for (const listener of listeners) listener(event);
  };
  es.onerror = () => {
    // Native EventSource retries transient drops on its own. CLOSED is
    // permanent (e.g. a non-2xx response during a server restart) — without
    // this handler the singleton stayed truthy-but-dead and every future
    // subscriber silently received no events.
    if (es.readyState !== EventSource.CLOSED) return;
    es.close();
    if (source === es) source = null;
    if (listeners.size > 0 && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (listeners.size > 0) ensureSource();
      }, RECONNECT_DELAY_MS);
    }
  };
}

export function subscribeGlobalStream(listener: Listener): () => void {
  listeners.add(listener);
  ensureSource();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (source) {
        source.close();
        source = null;
      }
    }
  };
}

/** Calls `handler` for every global stream event while mounted. */
export function useGlobalStreamEvent(handler: Listener): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribeGlobalStream((event) => handlerRef.current(event));
  }, []);
}
