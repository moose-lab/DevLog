import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCAL_CLI_MODEL,
  DEFAULT_LOCAL_CLI_REASONING,
  LOCAL_CLI_AGENT_DEFINITIONS,
  LOCAL_CLI_INTELLIGENCE_OPTIONS,
  SUPPORTED_LOCAL_CLI_AGENT_NAMES,
  detectLocalCliAgents,
  getLocalCliAgentStatus,
  getLocalCliAgentStatusLabel,
  resolveExecutableOnPath,
  type LocalCliAgentDefinition,
} from "../local-cli-agents";

const fakeDefinition: LocalCliAgentDefinition = {
  id: "fake",
  name: "Fake CLI",
  bin: "fake",
  versionArgs: ["--version"],
  models: [DEFAULT_LOCAL_CLI_MODEL],
};

test("resolveExecutableOnPath returns the first matching binary", () => {
  const result = resolveExecutableOnPath("fake", {
    pathEnv: "/missing:/tools",
    pathDelimiter: ":",
    pathExists: (candidate) => candidate === "/tools/fake",
  });

  assert.equal(result, "/tools/fake");
});

test("detectLocalCliAgents marks supported-but-missing CLIs unavailable", async () => {
  const [agent] = await detectLocalCliAgents({
    definitions: [fakeDefinition],
    pathEnv: "/missing",
    pathExists: () => false,
  });

  assert.equal(agent.id, "fake");
  assert.equal(agent.available, false);
  assert.equal(agent.path, undefined);
  assert.equal(agent.version, null);
  assert.equal(agent.status, "not-installed");
  assert.deepEqual(agent.models, [DEFAULT_LOCAL_CLI_MODEL]);
});

test("detectLocalCliAgents includes path and version for available CLIs", async () => {
  const [agent] = await detectLocalCliAgents({
    definitions: [fakeDefinition],
    pathEnv: "/tools",
    pathExists: (candidate) => candidate === "/tools/fake",
    execFileProbe: async (file, args) => {
      assert.equal(file, "/tools/fake");
      assert.deepEqual(args, ["--version"]);
      return { stdout: "fake 1.2.3\n", stderr: "" };
    },
  });

  assert.equal(agent.available, true);
  assert.equal(agent.path, "/tools/fake");
  assert.equal(agent.version, "fake 1.2.3");
  assert.equal(agent.status, "available");
});

test("detectLocalCliAgents uses configured binary overrides when present", async () => {
  const definition: LocalCliAgentDefinition = {
    ...fakeDefinition,
    binEnvKey: "FAKE_BIN",
  };
  const [agent] = await detectLocalCliAgents({
    definitions: [definition],
    pathEnv: "/missing",
    localCliAgentEnv: {
      fake: { FAKE_BIN: "/custom/fake" },
    },
    pathExists: (candidate) => candidate === "/custom/fake",
    execFileProbe: async (file, args) => {
      assert.equal(file, "/custom/fake");
      assert.deepEqual(args, ["--version"]);
      return { stdout: "fake custom\n", stderr: "" };
    },
  });

  assert.equal(agent.available, true);
  assert.equal(agent.path, "/custom/fake");
  assert.equal(agent.version, "fake custom");
});

test("local CLI registry is limited to the current supported agent set", () => {
  assert.deepEqual(
    LOCAL_CLI_AGENT_DEFINITIONS.map((agent) => agent.id),
    [
      "claude",
      "codex",
      "gemini",
      "cursor-agent",
      "copilot",
      "kimi",
      "qwen",
      "hermes",
      "pi",
      "opencode",
    ],
  );
  assert.equal(LOCAL_CLI_AGENT_DEFINITIONS.length, 10);
  assert.deepEqual(SUPPORTED_LOCAL_CLI_AGENT_NAMES, [
    "Claude Code",
    "Codex CLI",
    "Gemini CLI",
    "Cursor Agent",
    "GitHub Copilot CLI",
    "Kimi CLI",
    "Qwen Code",
    "Hermes",
    "Pi",
    "OpenCode",
  ]);
  assert.equal(
    LOCAL_CLI_AGENT_DEFINITIONS.some((agent) =>
      [
        "aider",
        "antigravity",
        "deepseek",
        "devin",
        "grok",
        "kiro",
        "kilo",
        "qoder",
        "reasonix",
        "trae",
        "vibe",
      ].includes(agent.id),
    ),
    false,
  );
});

test("Claude Code and Codex CLI expose current model and intelligence choices", () => {
  const claude = LOCAL_CLI_AGENT_DEFINITIONS.find(
    (agent) => agent.id === "claude",
  );
  const codex = LOCAL_CLI_AGENT_DEFINITIONS.find(
    (agent) => agent.id === "codex",
  );

  assert.ok(claude);
  assert.ok(codex);
  assert.deepEqual(
    LOCAL_CLI_INTELLIGENCE_OPTIONS.map((option) => option.id),
    ["low", "medium", "high", "xhigh"],
  );
  assert.deepEqual(
    LOCAL_CLI_INTELLIGENCE_OPTIONS.map((option) => option.label),
    ["Low", "Medium", "High", "Extra High"],
  );
  assert.equal(DEFAULT_LOCAL_CLI_REASONING, "medium");
  assert.deepEqual(claude.reasoningOptions, LOCAL_CLI_INTELLIGENCE_OPTIONS);
  assert.deepEqual(codex.reasoningOptions, LOCAL_CLI_INTELLIGENCE_OPTIONS);
  assert.deepEqual(
    claude.models.map((model) => model.id),
    [
      "default",
      "best",
      "sonnet",
      "opus",
      "haiku",
      "opusplan",
      "sonnet[1m]",
      "opus[1m]",
      "claude-opus-4-8",
      "claude-opus-4-8[1m]",
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-sonnet-4-6[1m]",
      "claude-opus-4-6",
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-5-20250929",
    ],
  );
  assert.deepEqual(
    codex.models.map((model) => model.id),
    [
      "default",
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2-codex",
      "gpt-5.2",
      "gpt-5-codex",
      "gpt-5",
    ],
  );
});

test("local CLI status taxonomy distinguishes unavailable and pending runners", () => {
  assert.equal(
    getLocalCliAgentStatus({ available: false }),
    "not-installed",
  );
  assert.equal(
    getLocalCliAgentStatus({ available: true, runnerSupported: false }),
    "runner-pending",
  );
  assert.equal(getLocalCliAgentStatus({ available: true }), "available");
  assert.equal(
    getLocalCliAgentStatusLabel("not-installed"),
    "Supported · not detected",
  );
  assert.equal(
    getLocalCliAgentStatusLabel("runner-pending"),
    "Supported · runner pending",
  );
  assert.equal(
    getLocalCliAgentStatusLabel("available"),
    "Supported · available",
  );
});

test("detectLocalCliAgents uses dynamic line-separated model lists when available", async () => {
  const definition: LocalCliAgentDefinition = {
    ...fakeDefinition,
    modelList: {
      args: ["models"],
      parser: "line-separated",
      timeoutMs: 1000,
    },
  };
  const [agent] = await detectLocalCliAgents({
    definitions: [definition],
    pathEnv: "/tools",
    pathExists: (candidate) => candidate === "/tools/fake",
    execFileProbe: async (_file, args) => {
      if (args[0] === "--version") {
        return { stdout: "fake 1.2.3\n", stderr: "" };
      }
      assert.deepEqual(args, ["models"]);
      return {
        stdout: "provider/model-a\nprovider/model-a\n# comment\nprovider/model-b\n",
        stderr: "",
      };
    },
  });

  assert.deepEqual(agent.models, [
    DEFAULT_LOCAL_CLI_MODEL,
    { id: "provider/model-a", label: "provider/model-a" },
    { id: "provider/model-b", label: "provider/model-b" },
  ]);
});

test("detectLocalCliAgents falls back when dynamic model listing is unusable", async () => {
  const definition: LocalCliAgentDefinition = {
    ...fakeDefinition,
    modelList: {
      args: ["models"],
      parser: "cursor-line-separated",
    },
  };
  const [agent] = await detectLocalCliAgents({
    definitions: [definition],
    pathEnv: "/tools",
    pathExists: (candidate) => candidate === "/tools/fake",
    execFileProbe: async (_file, args) => {
      if (args[0] === "--version") {
        return { stdout: "fake 1.2.3\n", stderr: "" };
      }
      return { stdout: "No models available for this account.\n", stderr: "" };
    },
  });

  assert.deepEqual(agent.models, [DEFAULT_LOCAL_CLI_MODEL]);
});
