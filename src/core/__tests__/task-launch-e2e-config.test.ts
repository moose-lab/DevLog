import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildTaskLaunchRuntimePayload,
} = await import("../../../scripts/task-launch-e2e-config.mjs");

function env(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides };
}

test("task launch E2E defaults to the current Local CLI runtime payload", () => {
  const payload = buildTaskLaunchRuntimePayload(env({}));

  assert.deepEqual(payload, {
    session_auth_mode: "local-cli",
    local_cli_agent_id: "claude",
    agent_model: "default",
    agent_reasoning: "medium",
  });
});

test("task launch E2E builds a transient BYOK provider payload from env", () => {
  const payload = buildTaskLaunchRuntimePayload(env({
    DEVLOG_E2E_AUTH_MODE: "anthropic-api-key",
    DEVLOG_E2E_API_PROTOCOL: "openai",
    DEVLOG_E2E_AGENT_MODEL: "gpt-4o-mini",
    DEVLOG_E2E_AGENT_BASE_URL: "https://api.openai.com/v1",
    DEVLOG_E2E_AGENT_MAX_TOKENS: "12000",
    DEVLOG_E2E_API_KEY: "sk-test",
  }));

  assert.deepEqual(payload, {
    session_auth_mode: "anthropic-api-key",
    agent_api_protocol: "openai",
    agent_model: "gpt-4o-mini",
    agent_base_url: "https://api.openai.com/v1",
    agent_api_version: "",
    agent_max_tokens: 12000,
    anthropic_api_key: "sk-test",
  });
});

test("task launch E2E can resolve a BYOK key from a named environment variable", () => {
  const payload = buildTaskLaunchRuntimePayload(env({
    DEVLOG_E2E_AUTH_MODE: "anthropic-api-key",
    DEVLOG_E2E_API_KEY_ENV_VAR: "DEVLOG_TEST_KEY",
    DEVLOG_TEST_KEY: "sk-from-env",
  }));

  assert.equal(
    (payload as Record<string, unknown>).anthropic_api_key,
    "sk-from-env",
  );
});

test("task launch E2E keeps legacy backend env-var mode available explicitly", () => {
  const payload = buildTaskLaunchRuntimePayload(env({
    DEVLOG_E2E_AUTH_MODE: "agent-api-key",
    DEVLOG_E2E_AGENT_API_KEY_ENV_VAR: "ANTHROPIC_API_KEY",
    DEVLOG_E2E_AGENT_MODEL: "claude-sonnet-4-6",
  }));

  assert.deepEqual(payload, {
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "ANTHROPIC_API_KEY",
    agent_model: "claude-sonnet-4-6",
  });
});
