import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchProviderModels } from "../api-provider-models";
import { resolveSessionRuntimeAuthConfig } from "../session-runtime-auth";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("fetchProviderModels lists Anthropic models", async () => {
  let requestedUrl = "";
  let apiKey = "";
  let version = "";

  const result = await fetchProviderModels(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "anthropic",
      agent_model: "claude-sonnet-4-6",
      agent_base_url: "https://api.anthropic.com",
      anthropic_api_key: "sk-ant-secret",
    }),
    {
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        const headers = new Headers(init?.headers);
        apiKey = headers.get("x-api-key") ?? "";
        version = headers.get("anthropic-version") ?? "";
        return jsonResponse(200, {
          data: [{ id: "claude-sonnet-4-6" }, { id: "claude-opus-4-7" }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ["claude-sonnet-4-6", "claude-opus-4-7"]);
  assert.equal(requestedUrl, "https://api.anthropic.com/v1/models");
  assert.equal(apiKey, "sk-ant-secret");
  assert.equal(version, "2023-06-01");
});

test("fetchProviderModels lists OpenAI-compatible models without persisting secrets", async () => {
  let requestedUrl = "";
  let authorization = "";

  const result = await fetchProviderModels(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-openai-secret",
    }),
    {
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return jsonResponse(200, {
          data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }, { id: "gpt-4o" }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ["gpt-4o", "gpt-4o-mini"]);
  assert.equal(requestedUrl, "https://api.openai.com/v1/models");
  assert.equal(authorization, "Bearer sk-openai-secret");
});

test("fetchProviderModels lists Azure OpenAI models with api-version", async () => {
  let requestedUrl = "";
  let apiKey = "";

  const result = await fetchProviderModels(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "azure",
      agent_model: "gpt-4.1",
      agent_base_url: "https://devlog-test.openai.azure.com",
      agent_api_version: "2024-10-21",
      anthropic_api_key: "azure-secret",
    }),
    {
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        apiKey = new Headers(init?.headers).get("api-key") ?? "";
        return jsonResponse(200, {
          data: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ["gpt-4.1", "gpt-4.1-mini"]);
  assert.equal(
    requestedUrl,
    "https://devlog-test.openai.azure.com/openai/models?api-version=2024-10-21",
  );
  assert.equal(apiKey, "azure-secret");
});

test("fetchProviderModels lists Azure OpenAI v1-compatible models", async () => {
  let requestedUrl = "";

  const result = await fetchProviderModels(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "azure",
      agent_model: "gpt-4.1",
      agent_base_url: "https://devlog-test.openai.azure.com/openai/v1",
      agent_api_version: "2024-10-21",
      anthropic_api_key: "azure-secret",
    }),
    {
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return jsonResponse(200, {
          data: [{ id: "gpt-4.1" }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ["gpt-4.1"]);
  assert.equal(
    requestedUrl,
    "https://devlog-test.openai.azure.com/openai/v1/models",
  );
});

test("fetchProviderModels lists Google Gemini models", async () => {
  let requestedUrl = "";
  let apiKey = "";

  const result = await fetchProviderModels(
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
        apiKey = new Headers(init?.headers).get("x-goog-api-key") ?? "";
        return jsonResponse(200, {
          models: [
            { name: "models/gemini-2.0-flash" },
            { name: "models/gemini-1.5-pro" },
          ],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ["gemini-2.0-flash", "gemini-1.5-pro"]);
  assert.equal(
    requestedUrl,
    "https://generativelanguage.googleapis.com/v1beta/models",
  );
  assert.equal(apiKey, "google-key");
});

test("fetchProviderModels lists loopback Ollama tags without an API key", async () => {
  let requestedUrl = "";

  const result = await fetchProviderModels(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "ollama",
      agent_model: "gemma3:4b",
      agent_base_url: "http://localhost:11434/api",
    }),
    {
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return jsonResponse(200, {
          models: [{ name: "gemma3:4b" }, { model: "qwen3-coder:480b" }],
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ["gemma3:4b", "qwen3-coder:480b"]);
  assert.equal(requestedUrl, "http://localhost:11434/api/tags");
});

test("fetchProviderModels redacts provider errors", async () => {
  const result = await fetchProviderModels(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-openai-secret",
    }),
    {
      fetchImpl: async () =>
        jsonResponse(401, {
          error: { message: "invalid key sk-openai-secret" },
        }),
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, "auth_failed");
  assert.equal(result.detail, "invalid key [redacted]");
});
