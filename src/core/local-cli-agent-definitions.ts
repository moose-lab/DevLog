export interface LocalCliModelOption {
  id: string;
  label: string;
}

export type LocalCliAgentStatus =
  | "available"
  | "not-installed"
  | "runner-pending";

export interface LocalCliAgentDefinition {
  id: string;
  name: string;
  bin: string;
  binEnvKey?: string;
  versionArgs: string[];
  models: LocalCliModelOption[];
  reasoningOptions?: LocalCliModelOption[];
  modelList?: {
    args: string[];
    parser: "line-separated" | "cursor-line-separated";
    timeoutMs?: number;
  };
  runnerSupported?: boolean;
}

export const DEFAULT_LOCAL_CLI_AGENT_ID = "claude";
export const DEFAULT_LOCAL_CLI_MODEL: LocalCliModelOption = {
  id: "default",
  label: "Default (CLI config)",
};
export const DEFAULT_LOCAL_CLI_REASONING = "medium";
export const LOCAL_CLI_INTELLIGENCE_OPTIONS: LocalCliModelOption[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra High" },
];

export const LOCAL_CLI_AGENT_DEFINITIONS: LocalCliAgentDefinition[] = [
  {
    id: DEFAULT_LOCAL_CLI_AGENT_ID,
    name: "Claude Code",
    bin: "claude",
    binEnvKey: "CLAUDE_BIN",
    versionArgs: ["--version"],
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "best", label: "Best (alias)" },
      { id: "sonnet", label: "Sonnet (alias)" },
      { id: "opus", label: "Opus (alias)" },
      { id: "haiku", label: "Haiku (alias)" },
      { id: "opusplan", label: "Opus Plan Mode (alias)" },
      { id: "sonnet[1m]", label: "Sonnet 1M context (alias)" },
      { id: "opus[1m]", label: "Opus 1M context (alias)" },
      { id: "claude-opus-4-8", label: "claude-opus-4-8" },
      { id: "claude-opus-4-8[1m]", label: "claude-opus-4-8[1m]" },
      { id: "claude-opus-4-7", label: "claude-opus-4-7" },
      { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
      { id: "claude-sonnet-4-6[1m]", label: "claude-sonnet-4-6[1m]" },
      { id: "claude-opus-4-6", label: "claude-opus-4-6" },
      { id: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001" },
      { id: "claude-sonnet-4-5-20250929", label: "claude-sonnet-4-5-20250929" },
    ],
    reasoningOptions: LOCAL_CLI_INTELLIGENCE_OPTIONS,
  },
  {
    id: "codex",
    name: "Codex CLI",
    bin: "codex",
    binEnvKey: "CODEX_BIN",
    versionArgs: ["--version"],
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "gpt-5.5", label: "gpt-5.5" },
      { id: "gpt-5.4", label: "gpt-5.4" },
      { id: "gpt-5.4-mini", label: "gpt-5.4-mini" },
      { id: "gpt-5.3-codex", label: "gpt-5.3-codex" },
      { id: "gpt-5.2-codex", label: "gpt-5.2-codex" },
      { id: "gpt-5.2", label: "gpt-5.2" },
      { id: "gpt-5-codex", label: "gpt-5-codex" },
      { id: "gpt-5", label: "gpt-5" },
    ],
    reasoningOptions: LOCAL_CLI_INTELLIGENCE_OPTIONS,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    binEnvKey: "GEMINI_BIN",
    versionArgs: ["--version"],
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    ],
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent",
    bin: "cursor-agent",
    binEnvKey: "CURSOR_AGENT_BIN",
    versionArgs: ["--version"],
    modelList: {
      args: ["models"],
      parser: "cursor-line-separated",
      timeoutMs: 5000,
    },
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "auto", label: "auto" },
      { id: "sonnet-4", label: "sonnet-4" },
      { id: "sonnet-4-thinking", label: "sonnet-4-thinking" },
      { id: "gpt-5", label: "gpt-5" },
    ],
  },
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    bin: "copilot",
    binEnvKey: "COPILOT_BIN",
    versionArgs: ["--version"],
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { id: "gpt-5.2", label: "GPT-5.2" },
    ],
  },
  {
    id: "kimi",
    name: "Kimi CLI",
    bin: "kimi",
    binEnvKey: "KIMI_BIN",
    versionArgs: ["--version"],
    runnerSupported: false,
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "kimi-k2-turbo-preview", label: "kimi-k2-turbo-preview" },
      { id: "moonshot-v1-8k", label: "moonshot-v1-8k" },
      { id: "moonshot-v1-32k", label: "moonshot-v1-32k" },
    ],
  },
  {
    id: "qwen",
    name: "Qwen Code",
    bin: "qwen",
    binEnvKey: "QWEN_BIN",
    versionArgs: ["--version"],
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "qwen3-coder-plus", label: "qwen3-coder-plus" },
      { id: "qwen3-coder-flash", label: "qwen3-coder-flash" },
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    bin: "hermes",
    binEnvKey: "HERMES_BIN",
    versionArgs: ["--version"],
    runnerSupported: false,
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "grok-4.3", label: "grok-4.3 (xAI · default)" },
      { id: "grok-4.20-reasoning", label: "grok-4.20-reasoning (xAI · deep)" },
      {
        id: "grok-4.20-0309-non-reasoning",
        label: "grok-4.20-non-reasoning (xAI · fast)",
      },
      {
        id: "grok-4.20-multi-agent-0309",
        label: "grok-4.20-multi-agent (xAI · orchestration)",
      },
      { id: "openai-codex:gpt-5.5", label: "gpt-5.5 (openai-codex:gpt-5.5)" },
      { id: "openai-codex:gpt-5.4", label: "gpt-5.4 (openai-codex:gpt-5.4)" },
      {
        id: "openai-codex:gpt-5.4-mini",
        label: "gpt-5.4-mini (openai-codex:gpt-5.4-mini)",
      },
    ],
  },
  {
    id: "pi",
    name: "Pi",
    bin: "pi",
    binEnvKey: "PI_BIN",
    versionArgs: ["--version"],
    runnerSupported: false,
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      {
        id: "anthropic/claude-sonnet-4-5",
        label: "Claude Sonnet 4.5 (anthropic)",
      },
      {
        id: "anthropic/claude-opus-4-5",
        label: "Claude Opus 4.5 (anthropic)",
      },
      { id: "openai/gpt-5", label: "GPT-5 (openai)" },
      { id: "openai/o4-mini", label: "o4-mini (openai)" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (google)" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (google)" },
    ],
    reasoningOptions: [
      { id: DEFAULT_LOCAL_CLI_REASONING, label: "Default" },
      { id: "off", label: "Off" },
      { id: "minimal", label: "Minimal" },
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High" },
      { id: "xhigh", label: "XHigh" },
    ],
  },
  {
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    binEnvKey: "OPENCODE_BIN",
    versionArgs: ["--version"],
    modelList: {
      args: ["models"],
      parser: "line-separated",
      timeoutMs: 8000,
    },
    models: [
      DEFAULT_LOCAL_CLI_MODEL,
      { id: "anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5" },
      { id: "openai/gpt-5", label: "openai/gpt-5" },
      { id: "google/gemini-2.5-pro", label: "google/gemini-2.5-pro" },
    ],
  },
];

export const SUPPORTED_LOCAL_CLI_AGENT_NAMES =
  LOCAL_CLI_AGENT_DEFINITIONS.map((agent) => agent.name);

export const LOCAL_CLI_AGENT_IDS = new Set(
  LOCAL_CLI_AGENT_DEFINITIONS.map((agent) => agent.id),
);

export function getLocalCliAgentStatus(agent: {
  available: boolean;
  runnerSupported?: boolean;
}): LocalCliAgentStatus {
  if (!agent.available) {
    return "not-installed";
  }
  return agent.runnerSupported === false ? "runner-pending" : "available";
}

export function getLocalCliAgentStatusLabel(
  status: LocalCliAgentStatus,
): string {
  switch (status) {
    case "available":
      return "Supported · available";
    case "runner-pending":
      return "Supported · runner pending";
    case "not-installed":
      return "Supported · not detected";
  }
}

export function isLocalCliAgentRunnable(agent: {
  available: boolean;
  runnerSupported?: boolean;
}): boolean {
  return getLocalCliAgentStatus(agent) === "available";
}
