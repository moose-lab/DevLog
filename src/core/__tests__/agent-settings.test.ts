import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_PROTOCOL_OPTIONS,
  DEFAULT_API_MAX_TOKENS,
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_BASE_URL_BY_PROTOCOL,
  KNOWN_API_PROVIDERS,
  SUGGESTED_MODELS_BY_PROTOCOL,
  buildSessionRuntimePayload,
  buildStoredAgentSettings,
  getBrowserApiKeyScope,
  getScopedBrowserApiKey,
  normalizeAgentSettings,
  setScopedBrowserApiKey,
} from "../agent-settings";

test("agent settings normalize to local CLI defaults", () => {
  const settings = normalizeAgentSettings(null);

  assert.deepEqual(settings, DEFAULT_AGENT_SETTINGS);
});

test("agent settings ignore invalid saved values", () => {
  const settings = normalizeAgentSettings({
    executionMode: "remote",
    localCliAgentId: "missing-cli",
    localCliModel: "bad model with spaces",
    localCliReasoning: "maximum",
    localCliAgentModels: {
      codex: { model: "bad model with spaces", reasoning: "maximum" },
    },
    apiModel: "bad model with spaces",
    apiBaseUrl: 42,
    model: "not-a-model",
    anthropicApiKey: 42,
  });

  assert.equal(settings.executionMode, DEFAULT_AGENT_SETTINGS.executionMode);
  assert.equal(settings.localCliAgentId, DEFAULT_AGENT_SETTINGS.localCliAgentId);
  assert.equal(settings.localCliModel, DEFAULT_AGENT_SETTINGS.localCliModel);
  assert.equal(settings.localCliReasoning, DEFAULT_AGENT_SETTINGS.localCliReasoning);
  assert.equal(settings.apiProtocol, DEFAULT_AGENT_SETTINGS.apiProtocol);
  assert.equal(settings.apiModel, DEFAULT_AGENT_SETTINGS.apiModel);
  assert.equal(settings.apiBaseUrl, DEFAULT_AGENT_SETTINGS.apiBaseUrl);
  assert.equal(settings.anthropicApiKey, "");
});

test("session runtime payload omits secrets for local CLI mode", () => {
  const payload = buildSessionRuntimePayload({
    ...DEFAULT_AGENT_SETTINGS,
    executionMode: "local-cli",
    localCliAgentId: "codex",
    localCliModel: "gpt-5-codex",
    localCliReasoning: "high",
    localCliAgentModels: {
      codex: { model: "gpt-5-codex", reasoning: "high" },
    },
    localCliAgentEnv: {},
    apiModel: "claude-opus-4-7",
    apiBaseUrl: "https://api.anthropic.com",
    anthropicApiKey: "sk-ant-secret",
  });

  assert.deepEqual(payload, {
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    agent_model: "gpt-5-codex",
    agent_reasoning: "high",
    local_cli_agent_env: {},
  });
});

test("session runtime payload includes transient key for Anthropic BYOK mode", () => {
  const payload = buildSessionRuntimePayload({
    executionMode: "anthropic-api",
    localCliAgentId: "codex",
    localCliModel: "gpt-5-codex",
    localCliReasoning: "high",
    localCliAgentModels: {
      codex: { model: "gpt-5-codex", reasoning: "high" },
    },
    localCliAgentEnv: {},
    apiProtocol: "anthropic",
    apiModel: "claude-sonnet-4-6",
    apiBaseUrl: " https://api.anthropic.com ",
    apiVersion: "",
    apiMaxTokens: 32768,
    apiProtocolConfigs: {},
    anthropicApiKey: " sk-ant-secret ",
  });

  assert.deepEqual(payload, {
    session_auth_mode: "anthropic-api-key",
    agent_api_protocol: "anthropic",
    agent_model: "claude-sonnet-4-6",
    agent_base_url: "https://api.anthropic.com",
    agent_api_version: "",
    agent_max_tokens: 32768,
    anthropic_api_key: "sk-ant-secret",
  });
});

test("stored agent settings omit browser-provided API keys", () => {
  const stored = buildStoredAgentSettings({
    executionMode: "anthropic-api",
    localCliAgentId: "codex",
    localCliModel: "gpt-5-codex",
    localCliReasoning: "high",
    localCliAgentModels: {
      codex: { model: "gpt-5-codex", reasoning: "high" },
    },
    localCliAgentEnv: {},
    apiProtocol: "anthropic",
    apiModel: "claude-opus-4-7",
    apiBaseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
    apiVersion: "",
    apiMaxTokens: 65536,
    apiProtocolConfigs: {},
    anthropicApiKey: "sk-ant-secret",
  });

  assert.deepEqual(stored, {
    executionMode: "anthropic-api",
    localCliAgentId: "codex",
    localCliModel: "gpt-5-codex",
    localCliReasoning: "high",
    localCliAgentModels: {
      codex: { model: "gpt-5-codex", reasoning: "high" },
    },
    localCliAgentEnv: {},
    apiProtocol: "anthropic",
    apiModel: "claude-opus-4-7",
    apiBaseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
    apiVersion: "",
    apiMaxTokens: 65536,
    apiProtocolConfigs: {
      anthropic: {
        apiModel: "claude-opus-4-7",
        apiBaseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
        apiVersion: "",
        apiMaxTokens: 65536,
      },
    },
  });
  assert.equal("anthropicApiKey" in stored, false);
});

test("agent settings expose the Open Design API protocol matrix", () => {
  assert.deepEqual(
    API_PROTOCOL_OPTIONS.map((protocol) => protocol.id),
    ["anthropic", "openai", "azure", "google", "ollama", "senseaudio"],
  );
  assert.equal(
    DEFAULT_BASE_URL_BY_PROTOCOL.google,
    "https://generativelanguage.googleapis.com",
  );
  assert.equal(SUGGESTED_MODELS_BY_PROTOCOL.openai[0], "gpt-4o");
  assert.equal(
    KNOWN_API_PROVIDERS.some(
      (provider) =>
        provider.protocol === "openai" &&
        provider.baseUrl === "https://api.openai.com/v1",
    ),
    true,
  );
});

test("agent settings preserve independent API protocol configuration", () => {
  const settings = normalizeAgentSettings({
    executionMode: "anthropic-api",
    apiProtocol: "openai",
    apiModel: "gpt-4o-mini",
    apiBaseUrl: "https://api.openai.com/v1",
    apiVersion: "",
    apiProtocolConfigs: {
      anthropic: {
        apiModel: "claude-sonnet-4-5",
        apiBaseUrl: "https://api.anthropic.com",
        apiVersion: "",
        apiMaxTokens: 12000,
      },
      azure: {
        apiModel: "my-deployment",
        apiBaseUrl: "https://example.openai.azure.com",
        apiVersion: "2024-10-21",
        apiMaxTokens: 64000,
      },
    },
    apiMaxTokens: 16000,
  });

  assert.equal(settings.apiProtocol, "openai");
  assert.equal(settings.apiModel, "gpt-4o-mini");
  assert.equal(settings.apiMaxTokens, 16000);
  assert.deepEqual(settings.apiProtocolConfigs.openai, {
    apiModel: "gpt-4o-mini",
    apiBaseUrl: "https://api.openai.com/v1",
    apiVersion: "",
    apiMaxTokens: 16000,
  });
  assert.deepEqual(settings.apiProtocolConfigs.azure, {
    apiModel: "my-deployment",
    apiBaseUrl: "https://example.openai.azure.com",
    apiVersion: "2024-10-21",
    apiMaxTokens: 64000,
  });
});

test("agent settings sanitize API max tokens using Open Design bounds", () => {
  assert.equal(
    normalizeAgentSettings({
      executionMode: "anthropic-api",
      apiMaxTokens: 1023,
    }).apiMaxTokens,
    DEFAULT_API_MAX_TOKENS,
  );

  assert.equal(
    normalizeAgentSettings({
      executionMode: "anthropic-api",
      apiMaxTokens: 200000,
    }).apiMaxTokens,
    200000,
  );
});

test("agent settings keep only allowlisted Local CLI environment values", () => {
  const settings = normalizeAgentSettings({
    executionMode: "local-cli",
    localCliAgentId: "codex",
    localCliAgentEnv: {
      codex: {
        CODEX_BIN: " /opt/dev/codex ",
        OPENAI_BASE_URL: " https://gateway.example.com/v1 ",
        BAD_ENV: "bad",
      },
      qoder: { QODER_BIN: "/tmp/qoder" },
      claude: {
        ANTHROPIC_API_KEY: " sk-ant-local ",
      },
    },
  });

  assert.deepEqual(settings.localCliAgentEnv, {
    codex: {
      CODEX_BIN: "/opt/dev/codex",
      OPENAI_BASE_URL: "https://gateway.example.com/v1",
    },
    claude: {
      ANTHROPIC_API_KEY: "sk-ant-local",
    },
  });
});

test("session runtime payload includes only the selected local CLI environment", () => {
  const payload = buildSessionRuntimePayload({
    ...DEFAULT_AGENT_SETTINGS,
    executionMode: "local-cli",
    localCliAgentId: "codex",
    localCliModel: "gpt-5-codex",
    localCliAgentEnv: {
      codex: {
        CODEX_BIN: "/opt/dev/codex",
        OPENAI_BASE_URL: "https://gateway.example.com/v1",
      },
      claude: {
        CLAUDE_CONFIG_DIR: "~/.claude-alt",
      },
    },
  });

  assert.deepEqual(payload, {
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    agent_model: "gpt-5-codex",
    agent_reasoning: "medium",
    local_cli_agent_env: {
      CODEX_BIN: "/opt/dev/codex",
      OPENAI_BASE_URL: "https://gateway.example.com/v1",
    },
  });
});

test("agent settings cap browser-provided API keys", () => {
  const settings = normalizeAgentSettings({
    executionMode: "anthropic-api",
    apiModel: "claude-sonnet-4-6",
    apiBaseUrl: "https://api.anthropic.com",
    anthropicApiKey: "x".repeat(400),
  });

  assert.equal(settings.anthropicApiKey.length, 300);
});

test("browser API keys are scoped by protocol and base URL", () => {
  const anthropic = normalizeAgentSettings({
    executionMode: "anthropic-api",
    apiProtocol: "anthropic",
    apiBaseUrl: "https://api.anthropic.com",
  });
  const openai = normalizeAgentSettings({
    executionMode: "anthropic-api",
    apiProtocol: "openai",
    apiBaseUrl: " https://api.openai.com/v1/ ",
  });
  let scopedKeys = setScopedBrowserApiKey(
    anthropic,
    {},
    "sk-ant-provider",
  );

  assert.equal(getScopedBrowserApiKey(anthropic, scopedKeys), "sk-ant-provider");
  assert.equal(getScopedBrowserApiKey(openai, scopedKeys), "");
  assert.notEqual(getBrowserApiKeyScope(anthropic), getBrowserApiKeyScope(openai));

  scopedKeys = setScopedBrowserApiKey(openai, scopedKeys, "sk-openai-provider");

  assert.equal(getScopedBrowserApiKey(anthropic, scopedKeys), "sk-ant-provider");
  assert.equal(getScopedBrowserApiKey(openai, scopedKeys), "sk-openai-provider");
});

test("legacy model field migrates into split local CLI and API settings", () => {
  const settings = normalizeAgentSettings({
    executionMode: "local-cli",
    model: "claude-opus-4-7",
  });

  assert.equal(settings.localCliAgentId, "claude");
  assert.equal(settings.localCliModel, "claude-opus-4-7");
  assert.equal(settings.apiModel, "claude-opus-4-7");
});

test("agent settings keep independent model choices per Local CLI agent", () => {
  const settings = normalizeAgentSettings({
    executionMode: "local-cli",
    localCliAgentId: "codex",
    localCliModel: "gpt-5-codex",
    localCliReasoning: "high",
    localCliAgentModels: {
      claude: { model: "claude-opus-4-7", reasoning: "medium" },
      codex: { model: "gpt-5-codex", reasoning: "high" },
      gemini: { model: "gemini-2.5-pro", reasoning: "medium" },
    },
  });

  assert.deepEqual(settings.localCliAgentModels.claude, {
    model: "claude-opus-4-7",
    reasoning: "medium",
  });
  assert.deepEqual(settings.localCliAgentModels.codex, {
    model: "gpt-5-codex",
    reasoning: "high",
  });
  assert.deepEqual(settings.localCliAgentModels.gemini, {
    model: "gemini-2.5-pro",
    reasoning: "medium",
  });
});

test("agent settings accept sanitized custom model ids", () => {
  const settings = normalizeAgentSettings({
    executionMode: "anthropic-api",
    localCliAgentId: "codex",
    localCliModel: "openai/gpt-5.2@preview",
    apiModel: "mimo-v2.5-pro",
    apiBaseUrl: " https://token-plan-cn.xiaomimimo.com/anthropic/ ",
  });

  assert.equal(settings.localCliModel, "openai/gpt-5.2@preview");
  assert.equal(settings.apiModel, "mimo-v2.5-pro");
  assert.equal(
    settings.apiBaseUrl,
    "https://token-plan-cn.xiaomimimo.com/anthropic",
  );
});

test("known API providers are scoped to explicit Open Design protocols", () => {
  assert.deepEqual(
    Array.from(new Set(KNOWN_API_PROVIDERS.map((provider) => provider.protocol))),
    ["anthropic", "openai", "azure", "google", "ollama", "senseaudio"],
  );
});
