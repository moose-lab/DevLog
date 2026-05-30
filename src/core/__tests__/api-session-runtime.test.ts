import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "./test-helpers";
import { runProviderSessionTurn } from "../api-session-runtime";
import type { ChatStreamEvent } from "../stream-manager";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("runProviderSessionTurn executes API mode without a Local CLI process", async () => {
  const db = makeTestDb();
  const events: ChatStreamEvent[] = [];
  let requestBody: unknown = null;

  db.prepare(
    `INSERT INTO sessions (
      id, project_id, worktree_path, status, session_auth_mode,
      local_cli_agent_id, agent_model, agent_reasoning, agent_api_protocol,
      agent_api_version, agent_base_url, agent_max_tokens
    ) VALUES (
      'session-api', 'test', '/repo', 'idle', 'anthropic-api-key',
      'claude', 'gpt-4o-mini', 'default', 'openai', '', 'https://api.openai.com/v1', 16384
    )`,
  ).run();
  db.prepare(
    "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'user', ?)",
  ).run("session-api", "Previous request");
  db.prepare(
    "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
  ).run("session-api", "Previous answer");

  const result = await runProviderSessionTurn({
    db,
    sessionId: "session-api",
    message: "Continue the work",
    runtimeAuthInput: {
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-openai-test",
    },
    emit: (_sessionId, event) => events.push(event),
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse(200, {
        choices: [{ message: { content: "Provider answer" } }],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(requestBody, {
    model: "gpt-4o-mini",
    max_tokens: 16384,
    messages: [
      { role: "user", content: "Previous request" },
      { role: "assistant", content: "Previous answer" },
      { role: "user", content: "Continue the work" },
    ],
    stream: false,
  });
  assert.deepEqual(
    db
      .prepare(
        "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id ASC",
      )
      .all("session-api"),
    [
      { role: "user", content: "Previous request" },
      { role: "assistant", content: "Previous answer" },
      { role: "user", content: "Continue the work" },
      { role: "assistant", content: "Provider answer" },
    ],
  );
  assert.equal(
    (
      db
        .prepare("SELECT status FROM sessions WHERE id = ?")
        .get("session-api") as { status: string }
    ).status,
    "idle",
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["status", "message", "text_delta", "message", "turn_end", "status"],
  );
});

test("runProviderSessionTurn fails before recording a user message when the browser API key is missing", async () => {
  const db = makeTestDb();
  const events: ChatStreamEvent[] = [];

  db.prepare(
    `INSERT INTO sessions (
      id, project_id, worktree_path, status, session_auth_mode,
      local_cli_agent_id, agent_model, agent_reasoning, agent_api_protocol,
      agent_api_version, agent_base_url
    ) VALUES (
      'session-missing-key', 'test', '/repo', 'idle', 'anthropic-api-key',
      'claude', 'gpt-4o-mini', 'default', 'openai', '', 'https://api.openai.com/v1'
    )`,
  ).run();

  const result = await runProviderSessionTurn({
    db,
    sessionId: "session-missing-key",
    message: "Do not persist this",
    runtimeAuthInput: {
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
    },
    emit: (_sessionId, event) => events.push(event),
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    db
      .prepare(
        "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id ASC",
      )
      .all("session-missing-key"),
    [],
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["error", "status"],
  );
});

test("runProviderSessionTurn removes the pending user message after the session is killed", async () => {
  const db = makeTestDb();
  const events: ChatStreamEvent[] = [];

  db.prepare(
    `INSERT INTO sessions (
      id, project_id, worktree_path, status, session_auth_mode,
      local_cli_agent_id, agent_model, agent_reasoning, agent_api_protocol,
      agent_api_version, agent_base_url, agent_max_tokens
    ) VALUES (
      'session-killed', 'test', '/repo', 'idle', 'anthropic-api-key',
      'claude', 'gpt-4o-mini', 'default', 'openai', '', 'https://api.openai.com/v1', 16384
    )`,
  ).run();

  const result = await runProviderSessionTurn({
    db,
    sessionId: "session-killed",
    message: "Stop before output",
    runtimeAuthInput: {
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-openai-test",
    },
    emit: (_sessionId, event) => events.push(event),
    fetchImpl: async () => {
      db.prepare(
        "UPDATE sessions SET status = 'killed', ended_at = datetime('now') WHERE id = ?",
      ).run("session-killed");
      return jsonResponse(200, {
        choices: [{ message: { content: "Provider answer after kill" } }],
      });
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    db
      .prepare(
        "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id ASC",
      )
      .all("session-killed"),
    [],
  );
  assert.equal(
    (
      db
        .prepare("SELECT status FROM sessions WHERE id = ?")
        .get("session-killed") as { status: string }
    ).status,
    "killed",
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["status"],
  );
});
