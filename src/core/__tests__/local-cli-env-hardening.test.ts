import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionRuntimeAuthConfig } from "../session-runtime-auth";

/**
 * Regression tests for CR-7 / IM-21 (REVIEW-2026-06-10): request bodies could
 * point *_BIN at any existing binary (POST {"CLAUDE_BIN":"/bin/sh"} spawned a
 * shell on an unauthenticated route) and spread unvalidated *_BASE_URL values
 * into the child CLI env (SSRF / provider-traffic redirection).
 */

test("*_BIN overrides not named after the agent binary are dropped (CR-7)", () => {
  const config = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "claude",
    local_cli_agent_env: { CLAUDE_BIN: "/bin/sh" },
  });
  assert.equal(config.localCliAgentEnv.CLAUDE_BIN, undefined);
});

test("*_BIN overrides pointing at the agent binary are kept", () => {
  const claude = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "claude",
    local_cli_agent_env: { CLAUDE_BIN: "/opt/tools/claude" },
  });
  assert.equal(claude.localCliAgentEnv.CLAUDE_BIN, "/opt/tools/claude");

  const codex = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    local_cli_agent_env: { CODEX_BIN: "C:\\tools\\codex.exe" },
  });
  assert.equal(codex.localCliAgentEnv.CODEX_BIN, "C:\\tools\\codex.exe");
});

test("base URLs failing connection validation are dropped (IM-21)", () => {
  const metadata = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    local_cli_agent_env: { OPENAI_BASE_URL: "http://169.254.169.254/v1" },
  });
  assert.equal(metadata.localCliAgentEnv.OPENAI_BASE_URL, undefined);

  const privateIp = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "claude",
    local_cli_agent_env: { ANTHROPIC_BASE_URL: "http://10.0.0.5" },
  });
  assert.equal(privateIp.localCliAgentEnv.ANTHROPIC_BASE_URL, undefined);
});

test("valid proxy and loopback base URLs are kept", () => {
  const proxy = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "codex",
    local_cli_agent_env: { OPENAI_BASE_URL: "https://gateway.example.com/v1" },
  });
  assert.equal(
    proxy.localCliAgentEnv.OPENAI_BASE_URL,
    "https://gateway.example.com/v1"
  );

  const loopback = resolveSessionRuntimeAuthConfig({
    session_auth_mode: "local-cli",
    local_cli_agent_id: "claude",
    local_cli_agent_env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8080" },
  });
  assert.equal(
    loopback.localCliAgentEnv.ANTHROPIC_BASE_URL,
    "http://127.0.0.1:8080"
  );
});
