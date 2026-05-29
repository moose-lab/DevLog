import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AGENT_API_KEY_ENV_VAR,
  DEFAULT_AGENT_MODEL,
  DEFAULT_SESSION_AUTH_MODE,
  buildClaudeProcessEnv,
  getSessionRuntimeAuthInputFromPayload,
  resolveSessionRuntimeAuthConfig,
} from "../session-runtime-auth";

test("missing runtime auth input resolves to local CLI", () => {
  const config = resolveSessionRuntimeAuthConfig({});

  assert.equal(config.mode, DEFAULT_SESSION_AUTH_MODE);
  assert.equal(config.mode, "local-cli");
  assert.equal(config.model, DEFAULT_AGENT_MODEL);
  assert.equal(config.agentApiKeyEnvVar, null);
  assert.equal(config.anthropicApiKey, null);
});

test("runtime auth payload parser keeps only string values", () => {
  assert.deepEqual(getSessionRuntimeAuthInputFromPayload(null), {});
  assert.deepEqual(getSessionRuntimeAuthInputFromPayload("bad"), {});
  assert.deepEqual(
    getSessionRuntimeAuthInputFromPayload({
      session_auth_mode: "anthropic-api-key",
      agent_api_key_env_var: 123,
      agent_model: 123,
      anthropic_api_key: 123,
    }),
    {
      session_auth_mode: "anthropic-api-key",
      agent_api_key_env_var: null,
      agent_model: null,
      anthropic_api_key: null,
    },
  );
});

test("Anthropic BYOK mode resolves to a transient browser API key", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "anthropic-api-key",
    agent_model: "claude-opus-4-7",
    anthropic_api_key: "  sk-ant-test-key  ",
  });

  assert.equal(config.mode, "anthropic-api-key");
  assert.equal(config.model, "claude-opus-4-7");
  assert.equal(config.anthropicApiKey, "sk-ant-test-key");
  assert.equal(config.agentApiKeyEnvVar, null);
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
