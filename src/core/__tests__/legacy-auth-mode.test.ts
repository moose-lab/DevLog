import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPersistedSessionAuthMode,
  resolveSessionRuntimeAuthConfig,
  resolveStoredSessionRuntimeAuthConfig,
} from "../session-runtime-auth";

/**
 * Regression test for IM-7 (REVIEW-2026-06-10): legacy agent-api-key
 * sessions were persisted as "anthropic-api-key", losing the env-var
 * marker — the next stored-config resolution treated them as browser BYOK
 * and threw "API key is required" although preflight had passed.
 */

test("legacy env-var sessions survive a persist/resolve round-trip (IM-7)", () => {
  const original = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "agent-api-key",
    agent_api_key_env_var: "MY_BACKEND_KEY",
  });
  assert.equal(original.usesLegacyEnvVar, true);
  assert.equal(original.agentApiKeyEnvVar, "MY_BACKEND_KEY");

  const persistedMode = getPersistedSessionAuthMode(original);
  assert.equal(persistedMode, "agent-api-key");

  // Simulate the next turn: stored row resolved with no transient key.
  const restored = resolveStoredSessionRuntimeAuthConfig({
    session_auth_mode: persistedMode,
    agent_api_key_env_var: "MY_BACKEND_KEY",
  });
  assert.equal(restored.usesLegacyEnvVar, true);
  assert.equal(restored.agentApiKeyEnvVar, "MY_BACKEND_KEY");
  assert.equal(restored.anthropicApiKey, null);
});

test("browser BYOK sessions persist their bare mode", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "anthropic-api-key",
    anthropic_api_key: "sk-ant-test",
  });
  assert.equal(config.usesLegacyEnvVar, false);
  assert.equal(getPersistedSessionAuthMode(config), "anthropic-api-key");

  const localCli = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
  });
  assert.equal(getPersistedSessionAuthMode(localCli), "local-cli");
});
