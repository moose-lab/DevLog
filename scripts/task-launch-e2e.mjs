#!/usr/bin/env node

const baseUrl = (process.env.DEVLOG_E2E_BASE_URL ?? "http://localhost:3000")
  .replace(/\/$/, "");
const projectId = process.env.DEVLOG_E2E_PROJECT_ID ?? "devlog";
const timeoutMs = Number(process.env.DEVLOG_E2E_TIMEOUT_MS ?? 180000);
const codingAgentId =
  process.env.DEVLOG_E2E_CODING_AGENT_ID ?? "general-coding-agent";
const agentTeamId =
  process.env.DEVLOG_E2E_AGENT_TEAM_ID ?? "implementation-review-team";
const sessionAuthMode =
  process.env.DEVLOG_E2E_AUTH_MODE ?? "backend-oauth";
const agentApiKeyEnvVar =
  process.env.DEVLOG_E2E_AGENT_API_KEY_ENV_VAR ?? "ANTHROPIC_API_KEY";

const startedAt = Date.now();
const marker = `DEVLOG_E2E_${Date.now()}`;
const initialAck = `${marker}_SESSION_READY`;
const followupAck = `${marker}_FOLLOWUP_ACK`;

function projectPath(path) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("projectId", projectId);
  return url;
}

async function request(path, init) {
  const res = await fetch(projectPath(path), init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return body;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label) {
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await predicate();
    if (lastValue) return lastValue;
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function watchSse(sessionId, evidence, signal) {
  const res = await fetch(projectPath(`/api/sessions/${sessionId}/stream`), {
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`SSE failed: ${res.status}`);
  }

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const raw = part.slice("data: ".length);
      try {
        const event = JSON.parse(raw);
        evidence.events.push(event.type);
        if (event.type === "sync") evidence.synced = true;
        if (event.type === "text_delta") evidence.textDeltas++;
        if (event.type === "message_queued") evidence.queued = true;
        if (event.type === "turn_end") evidence.turnEnds++;
        if (event.type === "error") evidence.errors.push(event.message);
      } catch {
        // Ignore non-JSON SSE data.
      }
    }
  }
}

async function main() {
  console.log(`DevLog task launch E2E against ${baseUrl} project=${projectId}`);

  const task = await request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `E2E task launch ${marker}`,
      priority: "low",
      prompt: [
        "This is a DevLog E2E smoke test.",
        `Reply with exactly ${initialAck}.`,
        "Do not edit files. Do not run shell commands. Do not commit.",
      ].join(" "),
    }),
  });
  console.log(`created task ${task.id}`);

  const launched = await request(`/api/tasks/${task.id}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      coding_agent_id: codingAgentId,
      agent_team_id: agentTeamId,
      session_auth_mode: sessionAuthMode,
      agent_api_key_env_var: agentApiKeyEnvVar,
    }),
  });
  const session = launched.session;
  if (!session?.id) throw new Error("execute response did not include session.id");
  console.log(`created session ${session.id}`);
  console.log(`${baseUrl}/sessions/${session.id}`);

  const evidence = {
    synced: false,
    queued: false,
    textDeltas: 0,
    turnEnds: 0,
    events: [],
    errors: [],
  };
  const controller = new AbortController();
  const sse = watchSse(session.id, evidence, controller.signal).catch((err) => {
    if (!controller.signal.aborted) throw err;
  });

  await waitFor(() => (evidence.synced ? evidence : null), "SSE sync");

  const patched = await request(`/api/sessions/${session.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "send",
      message: [
        "Human follow-up E2E instruction.",
        `Reply with exactly ${followupAck}.`,
      ].join(" "),
    }),
  });
  if (!("queue_length" in patched) || !("is_processing" in patched)) {
    throw new Error("session PATCH did not return processing metadata");
  }
  console.log(
    `sent follow-up is_processing=${patched.is_processing} queue_length=${patched.queue_length}`,
  );

  const messages = await waitFor(async () => {
    const rows = await request(`/api/sessions/${session.id}/messages`);
    const assistantText = rows
      .filter((msg) => msg.role === "assistant")
      .map((msg) => msg.content)
      .join("\n");
    if (/Failed to authenticate|API Error/i.test(assistantText)) {
      throw new Error(
        "Claude session authentication failed. Use backend OAuth on a logged-in Claude Code runtime or set DEVLOG_E2E_AUTH_MODE=agent-api-key with a backend env var such as ANTHROPIC_API_KEY.",
      );
    }
    if (assistantText.includes(followupAck)) return rows;
    if (evidence.errors.length > 0) {
      throw new Error(`session stream error: ${evidence.errors.join("; ")}`);
    }
    const latestSession = await request(`/api/sessions/${session.id}`);
    if (latestSession.status === "failed") {
      throw new Error("session failed before follow-up ack was received");
    }
    return null;
  }, followupAck);

  controller.abort();
  await sse;

  console.log(
    JSON.stringify(
      {
        ok: true,
        task_id: task.id,
        session_id: session.id,
        session_url: `${baseUrl}/sessions/${session.id}`,
        user_messages: messages.filter((msg) => msg.role === "user").length,
        assistant_messages: messages.filter((msg) => msg.role === "assistant")
          .length,
        sse_synced: evidence.synced,
        sse_text_deltas: evidence.textDeltas,
        sse_turn_ends: evidence.turnEnds,
        sse_queued: evidence.queued,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
