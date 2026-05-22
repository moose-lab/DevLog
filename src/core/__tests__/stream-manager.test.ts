import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSystemLogEvent,
  streamManager,
  type ChatStreamEvent,
} from "../stream-manager";

test("createSystemLogEvent builds timestamped global system events", () => {
  const event = createSystemLogEvent({
    level: "info",
    prefix: "[WATCHDOG]",
    message: "Session abc123 process started",
    sessionId: "abc123",
    timestamp: "2026-05-22T00:00:00.000Z",
  });

  assert.deepEqual(event, {
    type: "system_log",
    level: "info",
    prefix: "[WATCHDOG]",
    message: "Session abc123 process started",
    session_id: "abc123",
    timestamp: "2026-05-22T00:00:00.000Z",
  });
});

test("streamManager publishes global system log events", () => {
  const received: ChatStreamEvent[] = [];
  const unsubscribe = streamManager.subscribe("global", (event) => {
    received.push(event);
  });

  streamManager.emit("global", createSystemLogEvent({
    level: "info",
    message: "Session abc123 process started",
    sessionId: "abc123",
    timestamp: "2026-05-22T00:00:00.000Z",
  }));

  unsubscribe();

  assert.deepEqual(received, [
    {
      type: "system_log",
      level: "info",
      message: "Session abc123 process started",
      session_id: "abc123",
      timestamp: "2026-05-22T00:00:00.000Z",
    },
  ]);
});
