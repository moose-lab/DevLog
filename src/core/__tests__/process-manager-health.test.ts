import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_UNRESPONSIVE_MS,
  buildClaudeProcessArgs,
  buildLocalCliProcessLaunch,
  needsBrowserApiKeyForWatchdogRestart,
  parseClaudeBinaryPath,
  shouldRestartUnresponsiveSession,
  validateSessionRuntimeProcessLaunch,
  processManager,
} from "../process-manager";
import { resolveSessionRuntimeAuthConfig } from "../session-runtime-auth";
import { streamManager, type ChatStreamEvent } from "../stream-manager";

type GenericJsonLineTestProcess = {
  handleGenericJsonLine: (
    sessionId: string,
    sp: Record<string, unknown>,
    line: string,
  ) => void;
};

const genericJsonLineProcess =
  processManager as unknown as GenericJsonLineTestProcess;

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
      local_cli_agent_id: "claude",
      agent_model: "claude-opus-4-7",
      agent_reasoning: "xhigh",
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
  assert.deepEqual(
    args.slice(args.indexOf("--effort"), args.indexOf("--effort") + 2),
    ["--effort", "xhigh"],
  );
});

test("buildClaudeProcessArgs omits model flag when local CLI should use its own config", () => {
  const args = buildClaudeProcessArgs(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "claude",
      agent_model: "default",
    }),
    null,
    ["Read"],
  );

  assert.equal(args.includes("--model"), false);
  assert.deepEqual(
    args.slice(args.indexOf("--effort"), args.indexOf("--effort") + 2),
    ["--effort", "medium"],
  );
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

test("validateSessionRuntimeProcessLaunch validates API provider mode without a Local CLI", () => {
  const result = validateSessionRuntimeProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-test",
    }),
    "/repo",
    { NODE_ENV: "test", PATH: "/bin" },
    () => {
      throw new Error("Local CLI should not be resolved for direct API mode");
    },
  );

  assert.equal(result.ok, true);
});

test("buildLocalCliProcessLaunch rejects direct API provider configs", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-test",
    }),
    null,
    ["Read"],
    "/repo",
    () => "/mock/bin/claude",
  );

  assert.equal(launch.ok, false);
  if (launch.ok) return;
  assert.match(launch.error, /direct provider runtime/);
});

test("buildLocalCliProcessLaunch builds Codex stdin runner args", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "codex",
      agent_model: "gpt-5-codex",
      agent_reasoning: "high",
    }),
    null,
    ["Read"],
    "/repo",
    (agentId, bin) => `/mock/bin/${agentId}-${bin}`,
  );

  assert.equal(launch.ok, true);
  if (!launch.ok) return;
  assert.equal(launch.command, "/mock/bin/codex-codex");
  assert.equal(launch.inputProtocol, "plain-stdin");
  assert.equal(launch.outputProtocol, "json-event-stream");
  assert.equal(launch.eventParser, "codex");
  assert.deepEqual(launch.args, [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--full-auto",
    "-c",
    "sandbox_workspace_write.network_access=true",
    "-C",
    "/repo",
    "--model",
    "gpt-5-codex",
    "-c",
    'model_reasoning_effort="high"',
    "-",
  ]);
});

test("buildLocalCliProcessLaunch honors selected CLI binary overrides", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "codex",
      local_cli_agent_env: {
        CODEX_BIN: process.execPath,
      },
    }),
    null,
    ["Read"],
    "/repo",
    () => null,
  );

  assert.equal(launch.ok, true);
  if (!launch.ok) return;
  assert.equal(launch.command, process.execPath);
});

test("buildLocalCliProcessLaunch rejects missing CLI binary overrides", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "codex",
      local_cli_agent_env: {
        CODEX_BIN: "/missing/devlog/codex",
      },
    }),
    null,
    ["Read"],
    "/repo",
    () => "/mock/bin/codex",
  );

  assert.equal(launch.ok, false);
  if (launch.ok) return;
  assert.match(launch.error, /Configured Codex CLI binary.*does not exist/);
});

test("validateSessionRuntimeProcessLaunch rejects missing CLI binary overrides before creating a session", () => {
  const result = validateSessionRuntimeProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "codex",
      local_cli_agent_env: {
        CODEX_BIN: "/missing/devlog/codex",
      },
    }),
    "/repo",
    { NODE_ENV: "test", PATH: "/bin" },
    () => "/mock/bin/codex",
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Configured Codex CLI binary.*does not exist/);
});

test("buildLocalCliProcessLaunch honors Claude binary overrides", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "claude",
      local_cli_agent_env: {
        CLAUDE_BIN: process.execPath,
      },
    }),
    null,
    ["Read"],
    "/repo",
    () => null,
  );

  assert.equal(launch.ok, true);
  if (!launch.ok) return;
  assert.equal(launch.command, process.execPath);
});

test("buildLocalCliProcessLaunch passes custom model ids to supported runners", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "codex",
      agent_model: "openai/gpt-5.2@preview",
    }),
    null,
    ["Read"],
    "/repo",
    (agentId, bin) => `/mock/bin/${agentId}-${bin}`,
  );

  assert.equal(launch.ok, true);
  if (!launch.ok) return;
  assert.deepEqual(launch.args.slice(8, 10), [
    "--model",
    "openai/gpt-5.2@preview",
  ]);
});

test("buildLocalCliProcessLaunch fails clearly for pending runners", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "hermes",
    }),
    null,
    ["Read"],
    "/repo",
    (agentId, bin) => `/mock/bin/${agentId}-${bin}`,
  );

  assert.equal(launch.ok, false);
  if (launch.ok) return;
  assert.match(launch.error, /supported registry.*runner is still pending/);
});

test("buildLocalCliProcessLaunch builds Copilot stdin JSON runner args", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "copilot",
      agent_model: "gpt-5.2",
    }),
    null,
    ["Read"],
    "/repo",
    (agentId, bin) => `/mock/bin/${agentId}-${bin}`,
  );

  assert.equal(launch.ok, true);
  if (!launch.ok) return;
  assert.equal(launch.command, "/mock/bin/copilot-copilot");
  assert.equal(launch.inputProtocol, "plain-stdin");
  assert.equal(launch.outputProtocol, "json-event-stream");
  assert.equal(launch.eventParser, "copilot");
  assert.deepEqual(launch.args, [
    "--allow-all-tools",
    "--output-format",
    "json",
    "--model",
    "gpt-5.2",
  ]);
});

test("buildLocalCliProcessLaunch uses Qwen stdin without a dash sentinel", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "qwen",
      agent_model: "qwen3-coder-plus",
    }),
    null,
    ["Read"],
    "/repo",
    (agentId, bin) => `/mock/bin/${agentId}-${bin}`,
  );

  assert.equal(launch.ok, true);
  if (!launch.ok) return;
  assert.deepEqual(launch.args, ["--yolo", "--model", "qwen3-coder-plus"]);
});

test("validateSessionRuntimeProcessLaunch fails before creating a session for pending local runners", () => {
  const result = validateSessionRuntimeProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "hermes",
    }),
    "/repo",
    { NODE_ENV: "test", PATH: "/bin" },
    (agentId, bin) => `/mock/bin/${agentId}-${bin}`,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /supported registry.*runner is still pending/);
});

test("validateSessionRuntimeProcessLaunch fails before creating a session for missing BYOK keys", () => {
  const result = validateSessionRuntimeProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
    }),
    "/repo",
    { NODE_ENV: "test", PATH: "/bin" },
    (agentId, bin) => `/mock/bin/${agentId}-${bin}`,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /API key is required/);
});

test("generic JSON parser maps Copilot text and tool events", () => {
  const sessionId = "test-copilot-parser";
  const events: ChatStreamEvent[] = [];
  const unsubscribe = streamManager.subscribe(sessionId, (event) => {
    events.push(event);
  });
  const sp: Record<string, unknown> = {
    eventParser: "copilot",
    genericStreamState: {
      buffer: "",
      codexToolUses: new Set<string>(),
      openCodeToolUses: new Set<string>(),
      copilotToolNames: new Map<string, string>(),
      cursorTextSoFar: "",
    },
    textBuffer: "",
  };

  try {
    genericJsonLineProcess.handleGenericJsonLine(
      sessionId,
      sp,
      JSON.stringify({
        type: "assistant.message_delta",
        data: { deltaContent: "Hello" },
      }),
    );
    genericJsonLineProcess.handleGenericJsonLine(
      sessionId,
      sp,
      JSON.stringify({
        type: "tool.execution_start",
        data: {
          toolCallId: "tool-1",
          toolName: "Bash",
          arguments: { command: "pwd" },
        },
      }),
    );
    genericJsonLineProcess.handleGenericJsonLine(
      sessionId,
      sp,
      JSON.stringify({
        type: "tool.execution_complete",
        data: {
          toolCallId: "tool-1",
          success: true,
          result: { content: "/repo" },
        },
      }),
    );
  } finally {
    unsubscribe();
  }

  assert.deepEqual(events, [
    { type: "text_delta", text: "Hello" },
    { type: "tool_start", name: "Bash", input: { command: "pwd" } },
    { type: "tool_result", name: "Bash", output: "/repo", is_error: false },
  ]);
});

test("buildLocalCliProcessLaunch fails clearly when selected CLI is unavailable", () => {
  const launch = buildLocalCliProcessLaunch(
    resolveSessionRuntimeAuthConfig({
      session_auth_mode: "local-cli",
      local_cli_agent_id: "gemini",
    }),
    null,
    ["Read"],
    "/repo",
    () => null,
  );

  assert.equal(launch.ok, false);
  if (launch.ok) return;
  assert.match(launch.error, /not installed or not on PATH/);
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
