import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_UNRESPONSIVE_MS,
  buildClaudeProcessArgs,
  needsBrowserApiKeyForWatchdogRestart,
  parseClaudeBinaryPath,
  shouldRestartUnresponsiveSession,
} from "../process-manager";
import { resolveSessionRuntimeAuthConfig } from "../session-runtime-auth";

test("shouldRestartUnresponsiveSession only restarts live stale processes", () => {
  const now = Date.parse("2026-05-22T12:00:00.000Z");

  assert.equal(
    shouldRestartUnresponsiveSession({
      lastActivityAt: now - SESSION_UNRESPONSIVE_MS - 1,
      now,
      killed: false,
    }),
    true,
  );

  assert.equal(
    shouldRestartUnresponsiveSession({
      lastActivityAt: now - SESSION_UNRESPONSIVE_MS + 1,
      now,
      killed: false,
    }),
    false,
  );

  assert.equal(
    shouldRestartUnresponsiveSession({
      lastActivityAt: now - SESSION_UNRESPONSIVE_MS - 1,
      now,
      killed: true,
    }),
    false,
  );

  assert.equal(
    shouldRestartUnresponsiveSession({
      lastActivityAt: now - SESSION_UNRESPONSIVE_MS - 1,
      now,
      killed: false,
      paused: true,
    }),
    false,
  );
});

test("parseClaudeBinaryPath ignores shell alias descriptions", () => {
  // parseClaudeBinaryPath uses fs.existsSync to filter out junk lines that
  // happen to start with "/" (e.g. shell-alias descriptions). The candidate
  // path must therefore actually exist on the runner. process.execPath is
  // the running Node binary — always absolute, always present, on every
  // platform — which makes this test deterministic across Mac/Linux/Windows.
  const realPath = process.execPath;

  assert.equal(
    parseClaudeBinaryPath(
      `alias claude='command claude --dangerously-skip-permissions'\n${realPath}`,
    ),
    realPath,
  );

  assert.equal(
    parseClaudeBinaryPath(
      "claude: aliased to command claude --dangerously-skip-permissions",
    ),
    null,
  );
});

test("buildClaudeProcessArgs passes selected model for local CLI mode", () => {
  const args = buildClaudeProcessArgs(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      agent_model: "claude-opus-4-7",
    }),
    null,
    ["Read"],
  );

  assert.deepEqual(args.slice(0, 6), [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
  ]);
  assert.equal(args.includes("--bare"), false);
  assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), [
    "--model",
    "claude-opus-4-7",
  ]);
});

test("buildClaudeProcessArgs isolates Anthropic BYOK mode with bare CLI auth", () => {
  const args = buildClaudeProcessArgs(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_model: "claude-sonnet-4-6",
      anthropic_api_key: "sk-ant-test",
    }),
    "claude-session-id",
    ["Read", "Grep"],
  );

  assert.equal(args.includes("--bare"), true);
  assert.deepEqual(args.slice(args.indexOf("--resume"), args.indexOf("--resume") + 2), [
    "--resume",
    "claude-session-id",
  ]);
  assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), [
    "--model",
    "claude-sonnet-4-6",
  ]);
});

test("browser BYOK sessions cannot be watchdog-requeued without a transient key", () => {
  assert.equal(
    needsBrowserApiKeyForWatchdogRestart("anthropic-api-key", true),
    true,
  );
  assert.equal(
    needsBrowserApiKeyForWatchdogRestart("agent-api-key", true),
    false,
  );
  assert.equal(
    needsBrowserApiKeyForWatchdogRestart("anthropic-api-key", false),
    false,
  );
});
