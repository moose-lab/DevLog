import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "./test-helpers";
import { buildSessionStreamReplayEvents } from "../session-stream-replay";

test("buildSessionStreamReplayEvents replays running state, messages, and logs", () => {
  const db = makeTestDb();

  db.prepare(
    `INSERT INTO sessions (
      id, project_id, task_id, worktree_path, status, pid,
      started_at, session_auth_mode, local_cli_agent_id, agent_model, agent_reasoning
    ) VALUES (
      'session-running', 'videoclaw', NULL, '/repo', 'running', 6560,
      '2026-06-03 00:40:00', 'local-cli', 'codex', 'gpt-5.5', 'high'
    )`,
  ).run();
  db.prepare(
    "INSERT INTO session_messages (session_id, role, content, timestamp) VALUES (?, 'user', ?, ?)",
  ).run("session-running", "Initial prompt", "2026-06-03 00:41:14");
  db.prepare(
    "INSERT INTO session_logs (session_id, chunk, stream, timestamp) VALUES (?, ?, 'stderr', ?)",
  ).run("session-running", "warning: sandbox note", "2026-06-03 00:41:15");
  db.prepare(
    "INSERT INTO session_logs (session_id, chunk, stream, timestamp) VALUES (?, ?, 'stderr', ?)",
  ).run("session-running", "apply_patch verification failed", "2026-06-03 00:46:58");

  const events = buildSessionStreamReplayEvents(db, "session-running", {
    logLimit: 10,
  });

  assert.deepEqual(
    events.map((event) => event.type),
    ["status", "message", "log", "log"],
  );
  assert.deepEqual(events[0], {
    type: "status",
    status: "running",
    pid: 6560,
    started_at: "2026-06-03 00:40:00",
    ended_at: null,
  });
  assert.deepEqual(events[1], {
    type: "message",
    id: 1,
    role: "user",
    content: "Initial prompt",
  });
  assert.deepEqual(events[2], {
    type: "log",
    id: 1,
    stream: "stderr",
    chunk: "warning: sandbox note",
    timestamp: "2026-06-03 00:41:15",
  });
  assert.deepEqual(events[3], {
    type: "log",
    id: 2,
    stream: "stderr",
    chunk: "apply_patch verification failed",
    timestamp: "2026-06-03 00:46:58",
  });
});

test("buildSessionStreamReplayEvents limits logs to the newest selected subset in chronological order", () => {
  const db = makeTestDb();

  db.prepare(
    `INSERT INTO sessions (
      id, project_id, task_id, worktree_path, status, pid,
      started_at, session_auth_mode, local_cli_agent_id, agent_model, agent_reasoning
    ) VALUES (
      'session-log-limit', 'videoclaw', NULL, '/repo', 'running', 6560,
      '2026-06-03 00:40:00', 'local-cli', 'codex', 'gpt-5.5', 'high'
    )`,
  ).run();
  db.prepare(
    "INSERT INTO session_logs (session_id, chunk, stream, timestamp) VALUES (?, ?, 'stderr', ?)",
  ).run("session-log-limit", "oldest log", "2026-06-03 00:41:00");
  db.prepare(
    "INSERT INTO session_logs (session_id, chunk, stream, timestamp) VALUES (?, ?, 'stderr', ?)",
  ).run("session-log-limit", "middle log", "2026-06-03 00:42:00");
  db.prepare(
    "INSERT INTO session_logs (session_id, chunk, stream, timestamp) VALUES (?, ?, 'stderr', ?)",
  ).run("session-log-limit", "newest log", "2026-06-03 00:43:00");

  const events = buildSessionStreamReplayEvents(db, "session-log-limit", {
    logLimit: 2,
  });

  assert.deepEqual(
    events.map((event) => event.type),
    ["status", "log", "log"],
  );
  assert.deepEqual(events.slice(1), [
    {
      type: "log",
      id: 2,
      stream: "stderr",
      chunk: "middle log",
      timestamp: "2026-06-03 00:42:00",
    },
    {
      type: "log",
      id: 3,
      stream: "stderr",
      chunk: "newest log",
      timestamp: "2026-06-03 00:43:00",
    },
  ]);
});

test("buildSessionStreamReplayEvents interleaves messages and logs by timestamp", () => {
  const db = makeTestDb();

  db.prepare(
    `INSERT INTO sessions (
      id, project_id, task_id, worktree_path, status, pid,
      started_at, session_auth_mode, local_cli_agent_id, agent_model, agent_reasoning
    ) VALUES (
      'session-interleaved', 'videoclaw', NULL, '/repo', 'running', 6560,
      '2026-06-03 00:40:00', 'local-cli', 'codex', 'gpt-5.5', 'high'
    )`,
  ).run();
  db.prepare(
    "INSERT INTO session_logs (session_id, chunk, stream, timestamp) VALUES (?, ?, 'stdout', ?)",
  ).run("session-interleaved", "first log", "2026-06-03 00:41:00");
  db.prepare(
    "INSERT INTO session_messages (session_id, role, content, timestamp) VALUES (?, 'user', ?, ?)",
  ).run("session-interleaved", "User prompt", "2026-06-03 00:42:00");
  db.prepare(
    "INSERT INTO session_logs (session_id, chunk, stream, timestamp) VALUES (?, ?, 'stderr', ?)",
  ).run("session-interleaved", "second log", "2026-06-03 00:43:00");
  db.prepare(
    "INSERT INTO session_messages (session_id, role, content, timestamp) VALUES (?, 'assistant', ?, ?)",
  ).run("session-interleaved", "Assistant reply", "2026-06-03 00:44:00");

  const events = buildSessionStreamReplayEvents(db, "session-interleaved", {
    logLimit: 10,
  });

  assert.deepEqual(
    events.slice(1).map((event) => event.type),
    ["log", "message", "log", "message"],
  );
  assert.deepEqual(events.slice(1), [
    {
      type: "log",
      id: 1,
      stream: "stdout",
      chunk: "first log",
      timestamp: "2026-06-03 00:41:00",
    },
    {
      type: "message",
      id: 1,
      role: "user",
      content: "User prompt",
    },
    {
      type: "log",
      id: 2,
      stream: "stderr",
      chunk: "second log",
      timestamp: "2026-06-03 00:43:00",
    },
    {
      type: "message",
      id: 2,
      role: "assistant",
      content: "Assistant reply",
    },
  ]);
});
