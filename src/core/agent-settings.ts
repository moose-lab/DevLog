import type { SessionRuntimeAuthInput } from "./session-runtime-auth";
import {
  DEFAULT_LOCAL_CLI_AGENT_ID,
  DEFAULT_LOCAL_CLI_MODEL,
  DEFAULT_LOCAL_CLI_REASONING,
  LOCAL_CLI_AGENT_DEFINITIONS,
  LOCAL_CLI_AGENT_IDS,
} from "./local-cli-agent-definitions";

export type AgentExecutionMode = "local-cli" | "anthropic-api";
export type ApiProtocol =
  | "anthropic"
  | "openai"
  | "azure"
  | "google"
  | "ollama"
  | "senseaudio";

export interface AgentModelOption {
  id: string;
  label: string;
  description: string;
}

export interface AgentModelChoice {
  model?: string;
  reasoning?: string;
}

export type LocalCliAgentEnv = Record<string, Record<string, string>>;
export type BrowserApiKeyScopes = Record<string, string>;
export type ApiProtocolConfigs = Partial<
  Record<
    ApiProtocol,
    {
      apiModel: string;
      apiBaseUrl: string;
      apiVersion: string;
      apiMaxTokens: number;
    }
  >
>;

export interface LocalCliAgentEnvField {
  agentId: string;
  envKey: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

export interface AgentSettings {
  executionMode: AgentExecutionMode;
  localCliAgentId: string;
  localCliModel: string;
  localCliReasoning: string;
  localCliAgentModels: Record<string, AgentModelChoice>;
  localCliAgentEnv: LocalCliAgentEnv;
  apiProtocol: ApiProtocol;
  apiModel: string;
  apiBaseUrl: string;
  apiVersion: string;
  apiMaxTokens: number;
  apiProtocolConfigs: ApiProtocolConfigs;
  anthropicApiKey: string;
}

export type StoredAgentSettings = Pick<
  AgentSettings,
  | "executionMode"
  | "localCliAgentId"
  | "localCliModel"
  | "localCliReasoning"
  | "localCliAgentModels"
  | "localCliAgentEnv"
  | "apiProtocol"
  | "apiModel"
  | "apiBaseUrl"
  | "apiVersion"
  | "apiMaxTokens"
  | "apiProtocolConfigs"
>;

export const AGENT_SETTINGS_STORAGE_KEY = "devlog:agent-settings:v1";
export const MAX_ANTHROPIC_API_KEY_LENGTH = 300;
export const MAX_AGENT_SETTING_VALUE_LENGTH = 120;
export const MAX_AGENT_MODEL_ID_LENGTH = 200;
export const MAX_AGENT_BASE_URL_LENGTH = 500;
export const MAX_LOCAL_CLI_ENV_VALUE_LENGTH = 1000;
export const DEFAULT_API_MAX_TOKENS = 8192;
export const MIN_API_MAX_TOKENS = 1024;
export const MAX_API_MAX_TOKENS = 200000;

export const API_PROTOCOL_OPTIONS: Array<{
  id: ApiProtocol;
  title: string;
}> = [
  { id: "anthropic", title: "Anthropic" },
  { id: "openai", title: "OpenAI" },
  { id: "azure", title: "Azure OpenAI" },
  { id: "google", title: "Google Gemini" },
  { id: "ollama", title: "Ollama Cloud" },
  { id: "senseaudio", title: "SenseAudio" },
];

export const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  anthropic: "Anthropic API",
  openai: "OpenAI API",
  azure: "Azure OpenAI",
  google: "Google Gemini",
  ollama: "Ollama Cloud API",
  senseaudio: "SenseAudio API",
};

export const API_KEY_PLACEHOLDERS: Record<ApiProtocol, string> = {
  anthropic: "sk-ant-...",
  openai: "sk-...",
  azure: "azure key",
  google: "AIza...",
  ollama: "Ollama API key",
  senseaudio: "SenseAudio API key",
};

export const DEFAULT_BASE_URL_BY_PROTOCOL: Record<ApiProtocol, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  azure: "",
  google: "https://generativelanguage.googleapis.com",
  ollama: "https://ollama.com",
  senseaudio: "https://api.senseaudio.cn",
};

export const SUGGESTED_MODELS_BY_PROTOCOL: Record<ApiProtocol, readonly string[]> = {
  anthropic: [
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    "deepseek-chat",
    "deepseek-reasoner",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.7",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.1-highspeed",
    "MiniMax-M2.1",
    "MiniMax-M2",
    "mimo-v2.5-pro",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o4-mini",
    "deepseek-chat",
    "deepseek-reasoner",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.7",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.1-highspeed",
    "MiniMax-M2.1",
    "MiniMax-M2",
    "mimo-v2.5-pro",
  ],
  azure: ["gpt-4o", "gpt-4o-mini"],
  google: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  ollama: [
    "cogito-2.1:671b",
    "deepseek-v3.1:671b",
    "deepseek-v3.2",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "devstral-2:123b",
    "devstral-small-2:24b",
    "gemini-3-flash-preview",
    "gemma3:4b",
    "gemma3:12b",
    "gemma3:27b",
    "gemma4:31b",
    "glm-4.6",
    "glm-4.7",
    "glm-5",
    "glm-5.1",
    "gpt-oss:20b",
    "gpt-oss:120b",
    "kimi-k2:1t",
    "kimi-k2-thinking",
    "kimi-k2.5",
    "kimi-k2.6",
    "minimax-m2",
    "minimax-m2.1",
    "minimax-m2.5",
    "minimax-m2.7",
    "ministral-3:3b",
    "ministral-3:8b",
    "ministral-3:14b",
    "mistral-large-3:675b",
    "nemotron-3-nano:30b",
    "nemotron-3-super",
    "qwen3-coder:480b",
    "qwen3-coder-next",
    "qwen3-next:80b",
    "qwen3-vl:235b",
    "qwen3-vl:235b-instruct",
    "qwen3.5:397b",
    "rnj-1:8b",
  ],
  senseaudio: [
    "senseaudio-s2",
    "senseaudio-s2-flash",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "glm-5.1",
    "kimi-k2.6",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.7",
  ],
};

export const DEFAULT_API_PROTOCOL: ApiProtocol = "anthropic";
export const DEFAULT_MODEL_BY_PROTOCOL: Record<ApiProtocol, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
  azure: "gpt-4o",
  google: "gemini-2.0-flash",
  ollama: "gemma3:4b",
  senseaudio: "senseaudio-s2",
};
export const DEFAULT_API_AGENT_MODEL = DEFAULT_MODEL_BY_PROTOCOL.anthropic;
export const DEFAULT_API_BASE_URL = DEFAULT_BASE_URL_BY_PROTOCOL.anthropic;

export const AGENT_MODEL_OPTIONS: AgentModelOption[] =
  SUGGESTED_MODELS_BY_PROTOCOL.anthropic.map((model) => ({
    id: model,
    label: model,
    description:
      model === DEFAULT_API_AGENT_MODEL
        ? "Default Anthropic API model for balanced coding sessions."
        : "Suggested Anthropic-compatible API model.",
  }));

export const KNOWN_API_PROVIDERS: Array<{
  label: string;
  protocol: ApiProtocol;
  baseUrl: string;
  model: string;
  models?: string[];
  requiresApiKey?: boolean;
}> = [
  {
    label: "Anthropic (Claude)",
    protocol: "anthropic",
    baseUrl: DEFAULT_API_BASE_URL,
    model: DEFAULT_API_AGENT_MODEL,
    models: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
  },
  {
    label: "DeepSeek - Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"],
  },
  {
    label: "MiniMax - Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.minimaxi.com/anthropic",
    model: "MiniMax-M2.7-highspeed",
    models: [
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.7",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2.1",
      "MiniMax-M2",
    ],
  },
  {
    label: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  },
  {
    label: "Azure OpenAI",
    protocol: "azure",
    baseUrl: "",
    model: "",
    models: [],
  },
  {
    label: "Google Gemini",
    protocol: "google",
    baseUrl: DEFAULT_BASE_URL_BY_PROTOCOL.google,
    model: "gemini-2.0-flash",
    models: [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
  },
  {
    label: "DeepSeek - OpenAI",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"],
  },
  {
    label: "MiniMax - OpenAI",
    protocol: "openai",
    baseUrl: "https://api.minimaxi.com/v1",
    model: "MiniMax-M2.7-highspeed",
  },
  {
    label: "MiMo (Xiaomi) - OpenAI",
    protocol: "openai",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    model: "mimo-v2.5-pro",
    models: ["mimo-v2.5-pro"],
  },
  {
    label: "Ollama Cloud (managed)",
    protocol: "ollama",
    baseUrl: "https://ollama.com",
    model: "gpt-oss:120b",
    models: [...SUGGESTED_MODELS_BY_PROTOCOL.ollama],
  },
  {
    label: "Ollama Self-hosted (local)",
    protocol: "ollama",
    baseUrl: "http://localhost:11434",
    model: "gemma3:4b",
    models: ["gemma3:4b", "gemma3:12b", "gemma3:27b", "gpt-oss:20b"],
    requiresApiKey: false,
  },
  {
    label: "MiMo (Xiaomi) - Anthropic-compatible",
    protocol: "anthropic",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
    model: "mimo-v2.5-pro",
    models: ["mimo-v2.5-pro"],
  },
  {
    label: "SenseAudio",
    protocol: "senseaudio",
    baseUrl: DEFAULT_BASE_URL_BY_PROTOCOL.senseaudio,
    model: "senseaudio-s2",
    models: [...SUGGESTED_MODELS_BY_PROTOCOL.senseaudio],
  },
];

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  executionMode: "local-cli",
  localCliAgentId: DEFAULT_LOCAL_CLI_AGENT_ID,
  localCliModel: DEFAULT_LOCAL_CLI_MODEL.id,
  localCliReasoning: DEFAULT_LOCAL_CLI_REASONING,
  localCliAgentModels: {},
  localCliAgentEnv: {},
  apiProtocol: DEFAULT_API_PROTOCOL,
  apiModel: DEFAULT_API_AGENT_MODEL,
  apiBaseUrl: DEFAULT_API_BASE_URL,
  apiVersion: "",
  apiMaxTokens: DEFAULT_API_MAX_TOKENS,
  apiProtocolConfigs: {},
  anthropicApiKey: "",
};

export const LOCAL_CLI_AGENT_ENV_FIELDS: LocalCliAgentEnvField[] = [
  {
    agentId: "claude",
    envKey: "CLAUDE_CONFIG_DIR",
    label: "Claude config dir",
    placeholder: "~/.claude-2",
  },
  {
    agentId: "claude",
    envKey: "CLAUDE_BIN",
    label: "Claude binary path",
    placeholder: "/absolute/path/to/claude",
  },
  {
    agentId: "claude",
    envKey: "ANTHROPIC_BASE_URL",
    label: "Claude base URL",
    placeholder: "https://your-proxy.example.com",
  },
  {
    agentId: "claude",
    envKey: "ANTHROPIC_API_KEY",
    label: "Claude proxy API key",
    placeholder: "Paste proxy API key",
    secret: true,
  },
  {
    agentId: "codex",
    envKey: "CODEX_HOME",
    label: "Codex home",
    placeholder: "~/.codex-alt",
  },
  {
    agentId: "codex",
    envKey: "CODEX_BIN",
    label: "Codex binary path",
    placeholder: "/absolute/path/to/codex",
  },
  {
    agentId: "codex",
    envKey: "OPENAI_BASE_URL",
    label: "Codex base URL",
    placeholder: "https://your-proxy.example.com/v1",
  },
  {
    agentId: "codex",
    envKey: "CODEX_API_KEY",
    label: "Codex API key",
    placeholder: "Paste CODEX_API_KEY",
    secret: true,
  },
  {
    agentId: "codex",
    envKey: "OPENAI_API_KEY",
    label: "OpenAI API key",
    placeholder: "Paste OPENAI_API_KEY",
    secret: true,
  },
  ...LOCAL_CLI_AGENT_DEFINITIONS.filter(
    (agent) => agent.id !== "claude" && agent.id !== "codex" && agent.binEnvKey,
  ).map((agent) => ({
    agentId: agent.id,
    envKey: agent.binEnvKey!,
    label: `${agent.name} binary path`,
    placeholder: `/absolute/path/to/${agent.bin}`,
  })),
];

const LOCAL_CLI_AGENT_ENV_KEYS = new Map(
  LOCAL_CLI_AGENT_DEFINITIONS.map((agent) => [
    agent.id,
    new Set(
      LOCAL_CLI_AGENT_ENV_FIELDS.filter((field) => field.agentId === agent.id)
        .map((field) => field.envKey),
    ),
  ]),
);

const EXECUTION_MODES = new Set<AgentExecutionMode>([
  "local-cli",
  "anthropic-api",
]);

const API_PROTOCOL_IDS = new Set<ApiProtocol>(
  API_PROTOCOL_OPTIONS.map((protocol) => protocol.id),
);
const API_MODEL_IDS_BY_PROTOCOL = new Map(
  API_PROTOCOL_OPTIONS.map((protocol) => [
    protocol.id,
    new Set(SUGGESTED_MODELS_BY_PROTOCOL[protocol.id]),
  ]),
);
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getLegacyModel(value: Record<string, unknown>): string | null {
  return typeof value.model === "string" ? value.model : null;
}

export function sanitizeAgentModelId(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim().slice(0, MAX_AGENT_MODEL_ID_LENGTH);
  if (!trimmed || !MODEL_ID_RE.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function sanitizeApiProtocol(value: unknown): ApiProtocol {
  return typeof value === "string" && API_PROTOCOL_IDS.has(value as ApiProtocol)
    ? (value as ApiProtocol)
    : DEFAULT_AGENT_SETTINGS.apiProtocol;
}

function sanitizeApiVersion(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, MAX_AGENT_SETTING_VALUE_LENGTH);
}

export function sanitizeApiMaxTokens(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : NaN;
  if (
    Number.isInteger(parsed) &&
    parsed >= MIN_API_MAX_TOKENS &&
    parsed <= MAX_API_MAX_TOKENS
  ) {
    return parsed;
  }
  return DEFAULT_API_MAX_TOKENS;
}

function sanitizeApiModel(value: unknown, protocol: ApiProtocol): string {
  const fallback = DEFAULT_MODEL_BY_PROTOCOL[protocol];
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim().slice(0, MAX_AGENT_MODEL_ID_LENGTH);
  if (!trimmed) {
    return fallback;
  }
  if (API_MODEL_IDS_BY_PROTOCOL.get(protocol)?.has(trimmed)) {
    return trimmed;
  }
  return sanitizeAgentModelId(trimmed, fallback);
}

function sanitizeApiBaseUrl(value: unknown, protocol: ApiProtocol): string {
  if (typeof value !== "string") {
    return DEFAULT_BASE_URL_BY_PROTOCOL[protocol];
  }
  const trimmed = value.trim().slice(0, MAX_AGENT_BASE_URL_LENGTH);
  if (!trimmed) {
    return DEFAULT_BASE_URL_BY_PROTOCOL[protocol];
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_BASE_URL_BY_PROTOCOL[protocol];
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL_BY_PROTOCOL[protocol];
  }
}

export function getBrowserApiKeyScope(
  settings: Pick<AgentSettings, "apiProtocol" | "apiBaseUrl">,
): string {
  const apiProtocol = sanitizeApiProtocol(settings.apiProtocol);
  const apiBaseUrl = sanitizeApiBaseUrl(settings.apiBaseUrl, apiProtocol);
  // Use a delimiter that cannot appear in sanitized protocol names or URLs.
  return `${apiProtocol}\n${apiBaseUrl}`;
}

export function getScopedBrowserApiKey(
  settings: Pick<AgentSettings, "apiProtocol" | "apiBaseUrl">,
  scopedKeys: BrowserApiKeyScopes,
): string {
  return scopedKeys[getBrowserApiKeyScope(settings)] ?? "";
}

export function setScopedBrowserApiKey(
  settings: Pick<AgentSettings, "apiProtocol" | "apiBaseUrl">,
  scopedKeys: BrowserApiKeyScopes,
  apiKey: string,
): BrowserApiKeyScopes {
  const scope = getBrowserApiKeyScope(settings);
  const next = { ...scopedKeys };
  const normalizedKey = apiKey.slice(0, MAX_ANTHROPIC_API_KEY_LENGTH);
  if (normalizedKey) {
    next[scope] = normalizedKey;
  } else {
    delete next[scope];
  }
  return next;
}

function getLocalCliAgentDefinition(agentId: string) {
  return (
    LOCAL_CLI_AGENT_DEFINITIONS.find((agent) => agent.id === agentId) ??
    LOCAL_CLI_AGENT_DEFINITIONS[0]
  );
}

function sanitizeLocalCliAgentId(value: unknown): string {
  return typeof value === "string" && LOCAL_CLI_AGENT_IDS.has(value)
    ? value
    : DEFAULT_AGENT_SETTINGS.localCliAgentId;
}

function sanitizeKnownOption(
  value: unknown,
  allowedIds: Set<string>,
  fallback: string,
): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim().slice(0, MAX_AGENT_SETTING_VALUE_LENGTH);
  return allowedIds.has(trimmed) ? trimmed : fallback;
}

function sanitizeLocalCliModel(value: unknown, agentId: string): string {
  const localCliAgent = getLocalCliAgentDefinition(agentId);
  const localModelIds = new Set(localCliAgent.models.map((model) => model.id));
  if (typeof value !== "string") {
    return DEFAULT_AGENT_SETTINGS.localCliModel;
  }
  const trimmed = value.trim().slice(0, MAX_AGENT_MODEL_ID_LENGTH);
  if (!trimmed) {
    return DEFAULT_AGENT_SETTINGS.localCliModel;
  }
  return localModelIds.has(trimmed)
    ? trimmed
    : sanitizeAgentModelId(trimmed, DEFAULT_AGENT_SETTINGS.localCliModel);
}

function normalizeLocalCliAgentModels(
  value: unknown,
): Record<string, AgentModelChoice> {
  if (!isRecord(value)) {
    return {};
  }

  const choices: Record<string, AgentModelChoice> = {};
  for (const [agentId, rawChoice] of Object.entries(value)) {
    if (!LOCAL_CLI_AGENT_IDS.has(agentId) || !isRecord(rawChoice)) {
      continue;
    }

    const choice: AgentModelChoice = {};
    if (typeof rawChoice.model === "string") {
      const model = sanitizeLocalCliModel(rawChoice.model, agentId);
      if (model !== DEFAULT_AGENT_SETTINGS.localCliModel) {
        choice.model = model;
      }
    }
    if (typeof rawChoice.reasoning === "string") {
      const agent = getLocalCliAgentDefinition(agentId);
      const reasoning = sanitizeKnownOption(
        rawChoice.reasoning,
        new Set(
          (agent.reasoningOptions ?? [
            { id: DEFAULT_LOCAL_CLI_REASONING, label: "Default" },
          ]).map((option) => option.id),
        ),
        DEFAULT_AGENT_SETTINGS.localCliReasoning,
      );
      if (reasoning !== DEFAULT_AGENT_SETTINGS.localCliReasoning) {
        choice.reasoning = reasoning;
      } else if (rawChoice.reasoning.trim() === DEFAULT_LOCAL_CLI_REASONING) {
        choice.reasoning = DEFAULT_LOCAL_CLI_REASONING;
      }
    }

    if (choice.model || choice.reasoning) {
      choices[agentId] = choice;
    }
  }

  return choices;
}

export function normalizeLocalCliAgentEnv(value: unknown): LocalCliAgentEnv {
  if (!isRecord(value)) {
    return {};
  }

  const result: LocalCliAgentEnv = {};
  for (const [agentId, rawEnv] of Object.entries(value)) {
    if (!LOCAL_CLI_AGENT_IDS.has(agentId) || !isRecord(rawEnv)) {
      continue;
    }
    const allowed = LOCAL_CLI_AGENT_ENV_KEYS.get(agentId);
    if (!allowed) continue;

    const agentEnv: Record<string, string> = {};
    for (const [envKey, rawValue] of Object.entries(rawEnv)) {
      if (!allowed.has(envKey) || typeof rawValue !== "string") {
        continue;
      }
      const trimmed = rawValue.trim().slice(0, MAX_LOCAL_CLI_ENV_VALUE_LENGTH);
      if (trimmed) {
        agentEnv[envKey] = trimmed;
      }
    }
    if (Object.keys(agentEnv).length > 0) {
      result[agentId] = agentEnv;
    }
  }

  return result;
}

function normalizeApiProtocolConfigs(value: unknown): ApiProtocolConfigs {
  if (!isRecord(value)) {
    return {};
  }

  const result: ApiProtocolConfigs = {};
  for (const [rawProtocol, rawConfig] of Object.entries(value)) {
    if (!API_PROTOCOL_IDS.has(rawProtocol as ApiProtocol) || !isRecord(rawConfig)) {
      continue;
    }
    const protocol = rawProtocol as ApiProtocol;
    result[protocol] = {
      apiModel: sanitizeApiModel(rawConfig.apiModel, protocol),
      apiBaseUrl: sanitizeApiBaseUrl(rawConfig.apiBaseUrl, protocol),
      apiVersion: sanitizeApiVersion(rawConfig.apiVersion),
      apiMaxTokens: sanitizeApiMaxTokens(rawConfig.apiMaxTokens),
    };
  }

  return result;
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

  const legacyModel = getLegacyModel(value);
  const localCliAgentModels = normalizeLocalCliAgentModels(
    value.localCliAgentModels,
  );
  const localCliAgentEnv = normalizeLocalCliAgentEnv(value.localCliAgentEnv);
  const apiProtocol = sanitizeApiProtocol(value.apiProtocol);
  const apiProtocolConfigs = normalizeApiProtocolConfigs(value.apiProtocolConfigs);
  const savedApiProtocolConfig = apiProtocolConfigs[apiProtocol];
  const apiModel = sanitizeApiModel(
    value.apiModel ?? savedApiProtocolConfig?.apiModel ?? legacyModel,
    apiProtocol,
  );
  const apiBaseUrl = sanitizeApiBaseUrl(
    value.apiBaseUrl ?? savedApiProtocolConfig?.apiBaseUrl,
    apiProtocol,
  );
  const apiVersion = sanitizeApiVersion(
    value.apiVersion ?? savedApiProtocolConfig?.apiVersion,
  );
  const apiMaxTokens = sanitizeApiMaxTokens(
    value.apiMaxTokens ?? savedApiProtocolConfig?.apiMaxTokens,
  );
  const effectiveApiProtocolConfigs: ApiProtocolConfigs = {
    ...apiProtocolConfigs,
    [apiProtocol]: {
      apiModel,
      apiBaseUrl,
      apiVersion,
      apiMaxTokens,
    },
  };
  const localCliAgentId = sanitizeLocalCliAgentId(value.localCliAgentId);
  const localCliAgent = getLocalCliAgentDefinition(localCliAgentId);
  const localCliModel = sanitizeLocalCliModel(
    value.localCliModel ??
      localCliAgentModels[localCliAgentId]?.model ??
      legacyModel,
    localCliAgentId,
  );
  const localCliReasoning = sanitizeKnownOption(
    value.localCliReasoning ?? localCliAgentModels[localCliAgentId]?.reasoning,
    new Set(
      (localCliAgent.reasoningOptions ?? [
        { id: DEFAULT_LOCAL_CLI_REASONING, label: "Default" },
      ]).map((option) => option.id),
    ),
    DEFAULT_AGENT_SETTINGS.localCliReasoning,
  );
  const effectiveLocalCliAgentModels = { ...localCliAgentModels };
  const activeChoice: AgentModelChoice = {
    ...(effectiveLocalCliAgentModels[localCliAgentId] ?? {}),
  };
  if (localCliModel !== DEFAULT_AGENT_SETTINGS.localCliModel) {
    activeChoice.model = localCliModel;
  }
  if (
    localCliReasoning !== DEFAULT_AGENT_SETTINGS.localCliReasoning ||
    activeChoice.reasoning
  ) {
    activeChoice.reasoning = localCliReasoning;
  }
  if (activeChoice.model || activeChoice.reasoning) {
    effectiveLocalCliAgentModels[localCliAgentId] = activeChoice;
  }

  const anthropicApiKey =
    typeof value.anthropicApiKey === "string"
      ? value.anthropicApiKey.slice(0, MAX_ANTHROPIC_API_KEY_LENGTH)
      : "";

  return {
    executionMode,
    localCliAgentId,
    localCliModel,
    localCliReasoning,
    localCliAgentModels: effectiveLocalCliAgentModels,
    localCliAgentEnv,
    apiProtocol,
    apiModel,
    apiBaseUrl,
    apiVersion,
    apiMaxTokens,
    apiProtocolConfigs: effectiveApiProtocolConfigs,
    anthropicApiKey,
  };
}

export function buildStoredAgentSettings(
  settings: AgentSettings,
): StoredAgentSettings {
  const normalized = normalizeAgentSettings(settings);
  return {
    executionMode: normalized.executionMode,
    localCliAgentId: normalized.localCliAgentId,
    localCliModel: normalized.localCliModel,
    localCliReasoning: normalized.localCliReasoning,
    localCliAgentModels: normalized.localCliAgentModels,
    localCliAgentEnv: normalized.localCliAgentEnv,
    apiProtocol: normalized.apiProtocol,
    apiModel: normalized.apiModel,
    apiBaseUrl: normalized.apiBaseUrl,
    apiVersion: normalized.apiVersion,
    apiMaxTokens: normalized.apiMaxTokens,
    apiProtocolConfigs: normalized.apiProtocolConfigs,
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
      agent_api_protocol: normalized.apiProtocol,
      agent_model: normalized.apiModel,
      agent_base_url: normalized.apiBaseUrl,
      agent_api_version: normalized.apiVersion,
      agent_max_tokens: normalized.apiMaxTokens,
      anthropic_api_key: trimmedKey || null,
    };
  }

  return {
    session_auth_mode: "local-cli",
    local_cli_agent_id: normalized.localCliAgentId,
    agent_model: normalized.localCliModel,
    agent_reasoning: normalized.localCliReasoning,
    local_cli_agent_env:
      normalized.localCliAgentEnv[normalized.localCliAgentId] ?? {},
  };
}
