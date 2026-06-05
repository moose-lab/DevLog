import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AGENT_API_KEY_ENV_VAR,
  DEFAULT_AGENT_MODEL,
  DEFAULT_SESSION_AUTH_MODE,
  buildClaudeProcessEnv,
  getPersistedSessionBaseUrl,
  getSessionRuntimeAuthInputFromPayload,
  resolveSessionRuntimeAuthConfig,
} from "../session-runtime-auth";

test("missing runtime auth input resolves to local CLI", () => {
  const config = resolveSessionRuntimeAuthConfig({});

  assert.equal(config.mode, DEFAULT_SESSION_AUTH_MODE);
  assert.equal(config.mode, "local-cli");
  assert.equal(config.model, DEFAULT_AGENT_MODEL);
  assert.equal(config.localCliAgentId, "claude");
  assert.equal(config.reasoning, "medium");
  assert.equal(config.agentApiKeyEnvVar, null);
  assert.equal(config.anthropicApiKey, null);
});

test("runtime auth payload parser keeps only supported value shapes", () => {
  assert.deepEqual(getSessionRuntimeAuthInputFromPayload(null), {});
  assert.deepEqual(getSessionRuntimeAuthInputFromPayload("bad"), {});
  assert.deepEqual(
    getSessionRuntimeAuthInputFromPayload({
      session_auth_mode: "anthropic-api-key",
      agent_api_key_env_var: 123,
      local_cli_agent_id: 123,
      agent_model: 123,
      agent_reasoning: 123,
      agent_api_protocol: 123,
      agent_api_version: 123,
      agent_base_url: 123,
      agent_max_tokens: "bad",
      anthropic_api_key: 123,
      local_cli_agent_env: 123,
    }),
    {
      session_auth_mode: "anthropic-api-key",
      agent_api_key_env_var: null,
      local_cli_agent_id: null,
      agent_model: null,
      agent_reasoning: null,
      agent_api_protocol: null,
      agent_api_version: null,
      agent_base_url: null,
      agent_max_tokens: null,
      anthropic_api_key: null,
      local_cli_agent_env: null,
    },
  );
});

test("local CLI mode resolves selected agent, model, and reasoning", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    agent_model: "gpt-5-codex",
    agent_reasoning: "high",
  });

  assert.equal(config.mode, "local-cli");
  assert.equal(config.localCliAgentId, "codex");
  assert.equal(config.localCliAgentName, "Codex CLI");
  assert.equal(config.model, "gpt-5-codex");
  assert.equal(config.reasoning, "high");
});

test("whitespace-only local CLI agent id is treated as absent", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "   ",
    agent_model: "gpt-5-codex",
    agent_reasoning: "high",
  });

  assert.equal(config.localCliAgentId, "claude");
  assert.equal(config.model, "gpt-5-codex");
  assert.equal(config.reasoning, "high");
});

test("local CLI mode persists a non-null default base URL for session metadata", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "claude",
  });

  assert.equal(config.baseUrl, null);
  assert.equal(getPersistedSessionBaseUrl(config), "https://api.anthropic.com");
});

test("local CLI mode resolves selected allowlisted environment overrides", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    local_cli_agent_env: {
      CODEX_BIN: " /opt/dev/codex ",
      OPENAI_BASE_URL: " https://gateway.example.com/v1 ",
      BAD_ENV: "bad",
    },
  });

  assert.deepEqual(config.localCliAgentEnv, {
    CODEX_BIN: "/opt/dev/codex",
    OPENAI_BASE_URL: "https://gateway.example.com/v1",
  });
});

test("local CLI mode preserves sanitized custom model ids", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    agent_model: "openai/gpt-5.2@preview",
    agent_reasoning: "medium",
  });

  assert.equal(config.mode, "local-cli");
  assert.equal(config.localCliAgentId, "codex");
  assert.equal(config.model, "openai/gpt-5.2@preview");
  assert.equal(config.reasoning, "medium");
});

test("local CLI mode rejects unsafe custom model ids", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    agent_model: "bad model with spaces",
  });

  assert.equal(config.model, DEFAULT_AGENT_MODEL);
});

test("Anthropic BYOK mode resolves to a transient browser API key", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "anthropic-api-key",
    agent_model: "mimo-v2.5-pro",
    agent_base_url: " https://token-plan-cn.xiaomimimo.com/anthropic/ ",
    anthropic_api_key: "  sk-ant-test-key  ",
  });

  assert.equal(config.mode, "anthropic-api-key");
  assert.equal(config.model, "mimo-v2.5-pro");
  assert.equal(
    config.baseUrl,
    "https://token-plan-cn.xiaomimimo.com/anthropic",
  );
  assert.equal(config.anthropicApiKey, "sk-ant-test-key");
  assert.equal(config.agentApiKeyEnvVar, null);
});

test("API BYOK mode resolves protocol and API version", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "anthropic-api-key",
    agent_api_protocol: "azure",
    agent_model: "my-deployment",
    agent_base_url: " https://example.openai.azure.com/ ",
    agent_api_version: " 2024-10-21 ",
    anthropic_api_key: " azure-key ",
    agent_max_tokens: 64000,
  });

  assert.equal(config.mode, "anthropic-api-key");
  assert.equal(config.apiProtocol, "azure");
  assert.equal(config.model, "my-deployment");
  assert.equal(config.baseUrl, "https://example.openai.azure.com");
  assert.equal(config.apiVersion, "2024-10-21");
  assert.equal(config.maxTokens, 64000);
  assert.equal(config.anthropicApiKey, "azure-key");
});

test("API BYOK mode falls back when max tokens are outside Open Design bounds", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "anthropic-api-key",
    agent_api_protocol: "openai",
    agent_model: "gpt-4o",
    agent_base_url: "https://api.openai.com/v1",
    anthropic_api_key: "sk-test",
    agent_max_tokens: 999999,
  });

  assert.equal(config.maxTokens, 8192);
});

test("buildClaudeProcessEnv refuses to bridge direct provider protocols through Claude CLI env", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "anthropic-api-key",
    agent_api_protocol: "openai",
    agent_model: "gpt-4o-mini",
    agent_base_url: "https://api.openai.com/v1",
    anthropic_api_key: "sk-test",
  });
  const result = buildClaudeProcessEnv({ NODE_ENV: "test", PATH: "/bin" }, config);

  assert.equal(result.ok, false);
  assert.match(result.error, /OpenAI API.*direct provider runtime.*Claude CLI/);
});

test("legacy agent API key mode still resolves to a sanitized backend environment variable", () => {
  const custom = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "DEVLOG_FRONTEND_AGENT_API_KEY",
  });

  assert.equal(custom.mode, "anthropic-api-key");
  assert.equal(custom.agentApiKeyEnvVar, "DEVLOG_FRONTEND_AGENT_API_KEY");

  const fallback = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "bad-name!",
  });

  assert.equal(fallback.agentApiKeyEnvVar, DEFAULT_AGENT_API_KEY_ENV_VAR);
});

test("buildClaudeProcessEnv maps transient BYOK key to ANTHROPIC_API_KEY", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "anthropic-api-key",
    anthropic_api_key: "sk-ant-browser-key",
    agent_base_url: "https://api.anthropic.com",
  });
  const result = buildClaudeProcessEnv(
    {
      NODE_ENV: "test",
      PATH: "/bin",
      ANTHROPIC_API_KEY: "previous-key",
    },
    config,
  );

  assert.equal(result.ok, true);
  assert.equal(result.env.ANTHROPIC_API_KEY, "sk-ant-browser-key");
  assert.equal(result.env.ANTHROPIC_BASE_URL, "https://api.anthropic.com");
});

test("buildClaudeProcessEnv maps selected legacy agent key env to ANTHROPIC_API_KEY", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "DEVLOG_BACKEND_AGENT_API_KEY",
  });
  const result = buildClaudeProcessEnv(
    {
      NODE_ENV: "test",
      PATH: "/bin",
      DEVLOG_BACKEND_AGENT_API_KEY: "test-key",
      ANTHROPIC_API_KEY: "previous-key",
    },
    config,
  );

  assert.equal(result.ok, true);
  assert.equal(result.env.ANTHROPIC_API_KEY, "test-key");
});

test("buildClaudeProcessEnv strips inherited Local CLI API keys unless a custom base URL is configured", () => {
  const claudeDefault = buildClaudeProcessEnv(
    {
      NODE_ENV: "test",
      PATH: "/bin",
      ANTHROPIC_API_KEY: "ambient-key",
    },
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "claude",
    }),
  );
  assert.equal(claudeDefault.ok, true);
  assert.equal(claudeDefault.env.ANTHROPIC_API_KEY, undefined);

  const codexProxy = buildClaudeProcessEnv(
    {
      NODE_ENV: "test",
      PATH: "/bin",
      OPENAI_API_KEY: "ambient-openai-key",
    },
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "codex",
      local_cli_agent_env: {
        OPENAI_BASE_URL: "https://gateway.example.com/v1",
        CODEX_API_KEY: "configured-codex-key",
      },
    }),
  );
  assert.equal(codexProxy.ok, true);
  assert.equal(codexProxy.env.OPENAI_BASE_URL, "https://gateway.example.com/v1");
  assert.equal(codexProxy.env.CODEX_API_KEY, "configured-codex-key");
  assert.equal(codexProxy.env.OPENAI_API_KEY, "ambient-openai-key");
});

test("buildClaudeProcessEnv returns an error when BYOK key is missing", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "anthropic-api-key",
  });
  const result = buildClaudeProcessEnv({ NODE_ENV: "test", PATH: "/bin" }, config);

  assert.equal(result.ok, false);
  assert.match(result.error, /Anthropic API key/);
});

test("buildClaudeProcessEnv returns an error when selected legacy key env is missing", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "DEVLOG_MISSING_AGENT_API_KEY",
  });
  const result = buildClaudeProcessEnv({ NODE_ENV: "test", PATH: "/bin" }, config);

  assert.equal(result.ok, false);
  assert.match(result.error, /DEVLOG_MISSING_AGENT_API_KEY/);
});

test("invalid local CLI selections fall back to supported defaults", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "missing-cli",
    agent_model: "gpt-5-codex",
    agent_reasoning: "high",
  });

  assert.equal(config.localCliAgentId, "claude");
  assert.equal(config.model, DEFAULT_AGENT_MODEL);
  assert.equal(config.reasoning, "medium");
});
