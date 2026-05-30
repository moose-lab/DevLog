import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runProviderChatCompletion,
  validateProviderRuntimeConfig,
} from "../api-provider-runtime";
import { resolveSessionRuntimeAuthConfig } from "../session-runtime-auth";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("runProviderChatCompletion posts OpenAI-compatible chat history", async () => {
  let requestedUrl = "";
  let authorization = "";
  let requestBody: unknown = null;

  const result = await runProviderChatCompletion(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-openai-test",
    }),
    [
      { role: "user", content: "Build the report" },
      { role: "assistant", content: "Draft created." },
      { role: "user", content: "Tighten it." },
    ],
    {
      maxTokens: 256,
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse(200, {
          choices: [{ message: { content: "Done." } }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.content, "Done.");
  assert.equal(requestedUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(authorization, "Bearer sk-openai-test");
  assert.deepEqual(requestBody, {
    model: "gpt-4o-mini",
    max_tokens: 256,
    messages: [
      { role: "user", content: "Build the report" },
      { role: "assistant", content: "Draft created." },
      { role: "user", content: "Tighten it." },
    ],
    stream: false,
  });
});

test("runProviderChatCompletion preserves existing versioned OpenAI-compatible base paths", async () => {
  let requestedUrl = "";

  const result = await runProviderChatCompletion(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "proxy-model",
      agent_base_url: "https://proxy.example.com/v2",
      anthropic_api_key: "sk-proxy-test",
    }),
    [{ role: "user", content: "Use proxy" }],
    {
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return jsonResponse(200, {
          choices: [{ message: { content: "Done." } }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(requestedUrl, "https://proxy.example.com/v2/chat/completions");
});

test("runProviderChatCompletion classifies 403 provider responses as forbidden", async () => {
  const result = await runProviderChatCompletion(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "restricted-model",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-openai-test",
    }),
    [{ role: "user", content: "Use restricted model" }],
    {
      fetchImpl: async () =>
        jsonResponse(403, {
          error: { message: "model not enabled for this account" },
        }),
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, "forbidden");
});

test("validateProviderRuntimeConfig allows loopback Ollama without an API key", () => {
  const result = validateProviderRuntimeConfig(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "ollama",
      agent_model: "gemma3:4b",
      agent_base_url: "http://localhost:11434",
    }),
  );

  assert.equal(result.ok, true);
});

test("validateProviderRuntimeConfig blocks private external hosts", () => {
  const result = validateProviderRuntimeConfig(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://10.0.0.10/v1",
      anthropic_api_key: "sk-test",
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Internal API hosts are blocked/);
});

test("validateProviderRuntimeConfig blocks IPv4-mapped IPv6 private hosts", () => {
  const result = validateProviderRuntimeConfig(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://[::ffff:192.168.1.1]/v1",
      anthropic_api_key: "sk-test",
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Internal API hosts are blocked/);
});
