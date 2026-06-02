import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  testSessionRuntimeConnection,
  validateAgentConnectionBaseUrl,
  type SpawnedConnectionProcess,
} from "../agent-connection-test";
import { resolveSessionRuntimeAuthConfig } from "../session-runtime-auth";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeSpawn(
  stdoutText: string,
  closeCode = 0,
  onStdin?: (text: string) => void,
) {
  return () => {
    const process = new EventEmitter() as EventEmitter & SpawnedConnectionProcess;
    process.stdin = new PassThrough();
    process.stdout = new PassThrough();
    process.stderr = new PassThrough();
    process.kill = () => true;
    let stdin = "";
    process.stdin.on("data", (chunk) => {
      stdin += chunk.toString();
    });
    process.stdin.on("finish", () => {
      onStdin?.(stdin);
      process.stdout?.emit("data", Buffer.from(stdoutText));
      process.emit("close", closeCode, null);
    });
    return process;
  };
}

test("validateAgentConnectionBaseUrl rejects private external API hosts but allows loopback", () => {
  assert.equal(
    validateAgentConnectionBaseUrl("http://127.0.0.1:11434").error,
    undefined,
  );
  assert.equal(
    validateAgentConnectionBaseUrl("https://10.0.0.5").error,
    "forbidden",
  );
  assert.equal(
    validateAgentConnectionBaseUrl("file:///tmp/model").error,
    "invalid_base_url",
  );
});

test("provider connection test requires the transient browser API key", async () => {
  let called = false;
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_model: "claude-sonnet-4-6",
      agent_base_url: "https://api.anthropic.com",
    }),
    {
      fetchImpl: async () => {
        called = true;
        return jsonResponse(200, {});
      },
    },
  );

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.kind, "auth_failed");
});

test("provider connection test posts an Anthropic smoke request and parses text", async () => {
  let requestedUrl = "";
  let requestBody: unknown = null;
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_model: "claude-sonnet-4-6",
      agent_base_url: "https://api.anthropic.com",
      anthropic_api_key: "sk-ant-test",
    }),
    {
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse(200, {
          content: [{ type: "text", text: "ok" }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "success");
  assert.equal(result.sample, "ok");
  assert.equal(requestedUrl, "https://api.anthropic.com/v1/messages");
  assert.deepEqual(requestBody, {
    model: "claude-sonnet-4-6",
    max_tokens: 8,
    messages: [{ role: "user", content: "Reply with only: ok" }],
  });
});

test("provider connection test posts an OpenAI-compatible smoke request and parses text", async () => {
  let requestedUrl = "";
  let authorization = "";
  let requestBody: unknown = null;
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-openai-test",
    }),
    {
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse(200, {
          choices: [{ message: { content: "ok" } }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.sample, "ok");
  assert.equal(requestedUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(authorization, "Bearer sk-openai-test");
  assert.deepEqual(requestBody, {
    model: "gpt-4o-mini",
    max_tokens: 8,
    messages: [{ role: "user", content: "Reply with only: ok" }],
    stream: false,
  });
});

test("provider connection test posts an Azure OpenAI smoke request", async () => {
  let requestedUrl = "";
  let apiKeyHeader = "";
  let requestBody: unknown = null;
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "azure",
      agent_model: "devlog-deployment",
      agent_base_url: "https://example.openai.azure.com",
      agent_api_version: "2024-10-21",
      anthropic_api_key: "azure-key",
    }),
    {
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        apiKeyHeader = new Headers(init?.headers).get("api-key") ?? "";
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse(200, {
          choices: [{ message: { content: "ok" } }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(
    requestedUrl,
    "https://example.openai.azure.com/openai/deployments/devlog-deployment/chat/completions?api-version=2024-10-21",
  );
  assert.equal(apiKeyHeader, "azure-key");
  assert.deepEqual(requestBody, {
    messages: [{ role: "user", content: "Reply with only: ok" }],
    stream: false,
    max_completion_tokens: 8,
  });
});

test("provider connection test posts a Google Gemini smoke request", async () => {
  let requestedUrl = "";
  let googleApiKeyHeader = "";
  let requestBody: unknown = null;
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "google",
      agent_model: "gemini-2.0-flash",
      agent_base_url: "https://generativelanguage.googleapis.com",
      anthropic_api_key: "google-key",
    }),
    {
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        googleApiKeyHeader = new Headers(init?.headers).get("x-goog-api-key") ?? "";
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse(200, {
          candidates: [
            { content: { parts: [{ text: "ok" }] } },
          ],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(
    requestedUrl,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
  );
  assert.equal(googleApiKeyHeader, "google-key");
  assert.deepEqual(requestBody, {
    contents: [
      { role: "user", parts: [{ text: "Reply with only: ok" }] },
    ],
    generationConfig: { maxOutputTokens: 8 },
  });
});

test("provider connection test posts native Ollama chat smoke request", async () => {
  let requestedUrl = "";
  let requestBody: unknown = null;
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "ollama",
      agent_model: "gemma3:4b",
      agent_base_url: "http://localhost:11434/api",
    }),
    {
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse(200, {
          message: { content: "ok" },
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(requestedUrl, "http://localhost:11434/api/chat");
  assert.deepEqual(requestBody, {
    model: "gemma3:4b",
    messages: [{ role: "user", content: "Reply with only: ok" }],
    stream: false,
  });
});

test("provider connection test posts SenseAudio as OpenAI-compatible", async () => {
  let requestedUrl = "";
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "senseaudio",
      agent_model: "senseaudio-s2-flash",
      agent_base_url: "https://api.senseaudio.cn",
      anthropic_api_key: "sense-key",
    }),
    {
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return jsonResponse(200, {
          choices: [{ message: { content: "ok" } }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(requestedUrl, "https://api.senseaudio.cn/v1/chat/completions");
});

test("provider connection test classifies auth and model failures", async () => {
  const auth = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_model: "claude-sonnet-4-6",
      agent_base_url: "https://api.anthropic.com",
      anthropic_api_key: "sk-ant-test",
    }),
    {
      fetchImpl: async () =>
        jsonResponse(401, { error: { message: "invalid key" } }),
    },
  );
  assert.equal(auth.ok, false);
  assert.equal(auth.kind, "auth_failed");

  const model = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_model: "missing-model",
      agent_base_url: "https://api.anthropic.com",
      anthropic_api_key: "sk-ant-test",
    }),
    {
      fetchImpl: async () =>
        jsonResponse(400, { error: { message: "model not found" } }),
    },
  );
  assert.equal(model.ok, false);
  assert.equal(model.kind, "not_found_model");
});

test("local CLI connection test reports missing binaries before spawn", async () => {
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "codex",
    }),
    {
      cwd: "/repo",
      resolveBin: () => null,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.kind, "agent_not_installed");
});

test("local CLI connection test allows slow auth refresh by default", () => {
  assert.equal(DEFAULT_AGENT_TIMEOUT_MS, 180_000);
});

test("local CLI connection test treats assistant text as a successful smoke run", async () => {
  let stdin = "";
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "qwen",
      agent_model: "qwen3-coder-plus",
    }),
    {
      cwd: "/repo",
      env: { NODE_ENV: "test", PATH: "/bin" },
      resolveBin: () => "/mock/bin/qwen",
      spawnImpl: fakeSpawn("ok\n", 0, (text) => {
        stdin = text;
      }),
      timeoutMs: 100,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "success");
  assert.equal(result.agentName, "Qwen Code");
  assert.equal(result.sample, "ok");
  assert.equal(stdin, "Reply with only: ok");
});

test("local CLI connection test extracts Codex agent messages and ignores reconnect errors", async () => {
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "codex",
      agent_model: "default",
    }),
    {
      cwd: "/repo",
      env: { NODE_ENV: "test", PATH: "/bin" },
      resolveBin: () => "/mock/bin/codex",
      spawnImpl: fakeSpawn(
        [
          JSON.stringify({
            type: "error",
            message: "Reconnecting... 2/5 (request timed out)",
          }),
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: "ok" },
          }),
          JSON.stringify({ type: "turn.completed" }),
          "",
        ].join("\n"),
        0,
      ),
      timeoutMs: 100,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "success");
  assert.equal(result.agentName, "Codex CLI");
  assert.equal(result.sample, "ok");
});

test("local CLI connection test rejects assistant text from non-zero exits", async () => {
  const result = await testSessionRuntimeConnection(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "qwen",
      agent_model: "qwen3-coder-plus",
    }),
    {
      cwd: "/repo",
      env: { NODE_ENV: "test", PATH: "/bin" },
      resolveBin: () => "/mock/bin/qwen",
      spawnImpl: fakeSpawn("Not logged in\n", 1),
      timeoutMs: 100,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.kind, "agent_spawn_failed");
  assert.match(result.detail ?? "", /exit 1/);
});
