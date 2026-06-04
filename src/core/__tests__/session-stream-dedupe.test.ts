import { test } from "node:test";
import assert from "node:assert/strict";
import { filterBufferedReplayDuplicates } from "../session-stream-dedupe";
import type { ChatStreamEvent } from "../stream-manager";

test("filterBufferedReplayDuplicates removes live buffered events already covered by replay", () => {
  const replayEvents: ChatStreamEvent[] = [
    { type: "status", status: "running" },
    { type: "message", id: 42, role: "user", content: "persisted prompt" },
    {
      type: "log",
      id: 7,
      stream: "stderr",
      chunk: "persisted warning",
      timestamp: "2026-06-04T01:00:00.000Z",
    },
  ];
  const bufferedEvents: ChatStreamEvent[] = [
    { type: "status", status: "running" },
    { type: "message", id: 42, role: "user", content: "persisted prompt" },
    {
      type: "log",
      id: 7,
      stream: "stderr",
      chunk: "persisted warning",
      timestamp: "2026-06-04T01:00:00.000Z",
    },
    { type: "message", id: 43, role: "user", content: "new prompt" },
    {
      type: "system_log",
      level: "info",
      message: "Codex turn started",
      timestamp: "2026-06-04T01:00:01.000Z",
    },
  ];

  assert.deepEqual(
    filterBufferedReplayDuplicates(replayEvents, bufferedEvents),
    [
      { type: "status", status: "running" },
      { type: "message", id: 43, role: "user", content: "new prompt" },
      {
        type: "system_log",
        level: "info",
        message: "Codex turn started",
        timestamp: "2026-06-04T01:00:01.000Z",
      },
    ],
  );
});

test("filterBufferedReplayDuplicates keeps same-content messages when ids differ", () => {
  const replayEvents: ChatStreamEvent[] = [
    { type: "message", id: 42, role: "user", content: "continue" },
  ];
  const bufferedEvents: ChatStreamEvent[] = [
    { type: "message", id: 43, role: "user", content: "continue" },
  ];

  assert.deepEqual(
    filterBufferedReplayDuplicates(replayEvents, bufferedEvents),
    [{ type: "message", id: 43, role: "user", content: "continue" }],
  );
});

test("filterBufferedReplayDuplicates preserves live status metadata updates", () => {
  const replayEvents: ChatStreamEvent[] = [
    { type: "status", status: "running", pid: 1001 },
  ];
  const bufferedEvents: ChatStreamEvent[] = [
    { type: "status", status: "running", pid: 2002 },
  ];

  assert.deepEqual(
    filterBufferedReplayDuplicates(replayEvents, bufferedEvents),
    [{ type: "status", status: "running", pid: 2002 }],
  );
});
