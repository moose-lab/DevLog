import type { SessionRuntimeAuthInput } from "./session-runtime-auth";

export type AgentExecutionMode = "local-cli" | "anthropic-api";

export interface AgentModelOption {
  id: string;
  label: string;
  description: string;
}

export interface AgentSettings {
  executionMode: AgentExecutionMode;
  model: string;
  anthropicApiKey: string;
}

export type StoredAgentSettings = Pick<
  AgentSettings,
  "executionMode" | "model"
>;

export const AGENT_SETTINGS_STORAGE_KEY = "devlog:agent-settings:v1";
export const MAX_ANTHROPIC_API_KEY_LENGTH = 300;

export const AGENT_MODEL_OPTIONS: AgentModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    description: "Default model for balanced coding sessions.",
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    description: "Higher reasoning budget for complex task planning.",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Lower latency for small edits and lightweight review.",
  },
];

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  executionMode: "local-cli",
  model: AGENT_MODEL_OPTIONS[0].id,
  anthropicApiKey: "",
};

const EXECUTION_MODES = new Set<AgentExecutionMode>([
  "local-cli",
  "anthropic-api",
]);

const MODEL_IDS = new Set(AGENT_MODEL_OPTIONS.map((model) => model.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeAgentSettings(value: unknown): AgentSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_AGENT_SETTINGS };
  }

  const executionMode = EXECUTION_MODES.has(
    value.executionMode as AgentExecutionMode,
  )
    ? (value.executionMode as AgentExecutionMode)
    : DEFAULT_AGENT_SETTINGS.executionMode;

  const model =
    typeof value.model === "string" && MODEL_IDS.has(value.model)
      ? value.model
      : DEFAULT_AGENT_SETTINGS.model;

  const anthropicApiKey =
    typeof value.anthropicApiKey === "string"
      ? value.anthropicApiKey.slice(0, MAX_ANTHROPIC_API_KEY_LENGTH)
      : "";

  return {
    executionMode,
    model,
    anthropicApiKey,
  };
}

export function buildStoredAgentSettings(
  settings: AgentSettings,
): StoredAgentSettings {
  const normalized = normalizeAgentSettings(settings);
  return {
    executionMode: normalized.executionMode,
    model: normalized.model,
  };
}

export function buildSessionRuntimePayload(
  settings: AgentSettings,
): SessionRuntimeAuthInput {
  const normalized = normalizeAgentSettings(settings);

  if (normalized.executionMode === "anthropic-api") {
    const trimmedKey = normalized.anthropicApiKey.trim();
    return {
      session_auth_mode: "anthropic-api-key",
      agent_model: normalized.model,
      anthropic_api_key: trimmedKey || null,
    };
  }

  return {
    session_auth_mode: "local-cli",
    agent_model: normalized.model,
  };
}
