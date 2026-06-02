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

test("runProviderSessionTurn preserves the session provider and model when current Settings drift", async () => {
  const db = makeTestDb();
  let requestUrl = "";
  let requestBody: unknown = null;

  db.prepare(
    `INSERT INTO sessions (
      id, project_id, worktree_path, status, session_auth_mode,
      local_cli_agent_id, agent_model, agent_reasoning, agent_api_protocol,
      agent_api_version, agent_base_url, agent_max_tokens
    ) VALUES (
      'session-persisted-runtime', 'test', '/repo', 'idle', 'anthropic-api-key',
      'claude', 'gpt-4o-mini', 'default', 'openai', '', 'https://api.openai.com/v1', 16384
    )`,
  ).run();

  const result = await runProviderSessionTurn({
    db,
    sessionId: "session-persisted-runtime",
    message: "Continue with the original session runtime",
    runtimeAuthInput: {
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "google",
      agent_model: "gemini-2.0-flash",
      agent_base_url: "https://generativelanguage.googleapis.com",
      agent_max_tokens: 4096,
      anthropic_api_key: "sk-openai-test",
    },
    emit: () => {},
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse(200, {
        choices: [{ message: { content: "Original provider answer" } }],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.match(requestUrl, /^https:\/\/api\.openai\.com\/v1\/chat\/completions/);
  assert.deepEqual(requestBody, {
    model: "gpt-4o-mini",
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: "Continue with the original session runtime",
      },
    ],
    stream: false,
  });
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

test("runProviderSessionTurn keeps the user message when the provider returns an error", async () => {
  const db = makeTestDb();
  const events: ChatStreamEvent[] = [];

  db.prepare(
    `INSERT INTO sessions (
      id, project_id, worktree_path, status, session_auth_mode,
      local_cli_agent_id, agent_model, agent_reasoning, agent_api_protocol,
      agent_api_version, agent_base_url, agent_max_tokens
    ) VALUES (
      'session-provider-error', 'test', '/repo', 'idle', 'anthropic-api-key',
      'claude', 'gpt-4o-mini', 'default', 'openai', '', 'https://api.openai.com/v1', 16384
    )`,
  ).run();

  const result = await runProviderSessionTurn({
    db,
    sessionId: "session-provider-error",
    message: "Keep this failed request",
    runtimeAuthInput: {
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-openai-test",
    },
    emit: (_sessionId, event) => events.push(event),
    fetchImpl: async () =>
      jsonResponse(500, {
        error: { message: "provider unavailable" },
      }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    events.map((event) => event.type),
    ["status", "message", "error", "status"],
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id ASC",
      )
      .all("session-provider-error"),
    [{ role: "user", content: "Keep this failed request" }],
  );
  assert.equal(
    (
      db
        .prepare("SELECT status FROM sessions WHERE id = ?")
        .get("session-provider-error") as { status: string }
    ).status,
    "failed",
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
