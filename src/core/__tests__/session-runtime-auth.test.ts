import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AGENT_API_KEY_ENV_VAR,
  DEFAULT_SESSION_AUTH_MODE,
  buildClaudeProcessEnv,
  getSessionRuntimeAuthInputFromPayload,
  resolveSessionRuntimeAuthConfig,
} from "../session-runtime-auth";

test("missing runtime auth input resolves to backend OAuth", () => {
  const config = resolveSessionRuntimeAuthConfig({});

  assert.equal(config.mode, DEFAULT_SESSION_AUTH_MODE);
  assert.equal(config.mode, "backend-oauth");
  assert.equal(config.agentApiKeyEnvVar, null);
});

test("runtime auth payload parser keeps only string values", () => {
  assert.deepEqual(getSessionRuntimeAuthInputFromPayload(null), {});
  assert.deepEqual(getSessionRuntimeAuthInputFromPayload("bad"), {});
  assert.deepEqual(
    getSessionRuntimeAuthInputFromPayload({
      session_auth_mode: "agent-api-key",
      agent_api_key_env_var: 123,
    }),
    {
      session_auth_mode: "agent-api-key",
      agent_api_key_env_var: null,
    },
  );
});

test("agent API key mode resolves to a sanitized backend environment variable", () => {
  const custom = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "DEVLOG_FRONTEND_AGENT_API_KEY",
  });

  assert.equal(custom.mode, "agent-api-key");
  assert.equal(custom.agentApiKeyEnvVar, "DEVLOG_FRONTEND_AGENT_API_KEY");

  const fallback = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "bad-name!",
  });

  assert.equal(fallback.agentApiKeyEnvVar, DEFAULT_AGENT_API_KEY_ENV_VAR);
});

test("buildClaudeProcessEnv maps selected agent key env to ANTHROPIC_API_KEY", () => {
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

test("buildClaudeProcessEnv returns an error when selected key env is missing", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "DEVLOG_MISSING_AGENT_API_KEY",
  });
  const result = buildClaudeProcessEnv({ NODE_ENV: "test", PATH: "/bin" }, config);

  assert.equal(result.ok, false);
  assert.match(result.error, /DEVLOG_MISSING_AGENT_API_KEY/);
});
