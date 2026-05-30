import {
  AGENT_MODEL_OPTIONS,
  MAX_ANTHROPIC_API_KEY_LENGTH,
} from "./agent-settings";

export type SessionRuntimeAuthMode = "local-cli" | "anthropic-api-key";
export type LegacySessionRuntimeAuthMode = "backend-oauth" | "agent-api-key";
export type SessionRuntimeAuthModeValue =
  | SessionRuntimeAuthMode
  | LegacySessionRuntimeAuthMode;

export interface SessionRuntimeAuthOption {
  id: SessionRuntimeAuthMode;
  label: string;
  description: string;
}

export interface SessionRuntimeAuthInput {
  session_auth_mode?: string | null;
  agent_api_key_env_var?: string | null;
  agent_model?: string | null;
  anthropic_api_key?: string | null;
}

export interface SessionRuntimeAuthConfig {
  mode: SessionRuntimeAuthMode;
  label: string;
  agentApiKeyEnvVar: string | null;
  model: string;
  anthropicApiKey: string | null;
  usesLegacyEnvVar: boolean;
}

export const DEFAULT_SESSION_AUTH_MODE: SessionRuntimeAuthMode =
  "local-cli";
export const DEFAULT_AGENT_API_KEY_ENV_VAR = "ANTHROPIC_API_KEY";
export const DEFAULT_AGENT_MODEL = AGENT_MODEL_OPTIONS[0].id;

export const SESSION_RUNTIME_AUTH_OPTIONS: SessionRuntimeAuthOption[] = [
  {
    id: "local-cli",
    label: "Local code-agent CLI",
    description: "Use the locally authenticated Claude Code CLI.",
  },
  {
    id: "anthropic-api-key",
    label: "Anthropic API (BYOK)",
    description: "Use a browser-stored Anthropic API key for this agent run.",
  },
];

const ENV_VAR_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const MODEL_IDS = new Set(AGENT_MODEL_OPTIONS.map((model) => model.id));

function sanitizeEnvVarName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || !ENV_VAR_RE.test(trimmed)) {
    return DEFAULT_AGENT_API_KEY_ENV_VAR;
  }
  return trimmed;
}

export function getSessionRuntimeAuthInputFromPayload(
  payload: unknown,
): SessionRuntimeAuthInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  return {
    session_auth_mode:
      typeof record.session_auth_mode === "string"
        ? record.session_auth_mode
        : null,
    agent_api_key_env_var:
      typeof record.agent_api_key_env_var === "string"
        ? record.agent_api_key_env_var
        : null,
    agent_model:
      typeof record.agent_model === "string" ? record.agent_model : null,
    anthropic_api_key:
      typeof record.anthropic_api_key === "string"
        ? record.anthropic_api_key
        : null,
  };
}

function normalizeRuntimeMode(
  mode: string | null | undefined,
): { mode: SessionRuntimeAuthMode; legacyEnvVar: boolean } {
  if (mode === "anthropic-api-key") {
    return { mode: "anthropic-api-key", legacyEnvVar: false };
  }
  if (mode === "agent-api-key") {
    return { mode: "anthropic-api-key", legacyEnvVar: true };
  }
  return { mode: DEFAULT_SESSION_AUTH_MODE, legacyEnvVar: false };
}

function sanitizeModel(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && MODEL_IDS.has(trimmed) ? trimmed : DEFAULT_AGENT_MODEL;
}

function sanitizeApiKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_ANTHROPIC_API_KEY_LENGTH) : null;
}

export function resolveSessionRuntimeAuthConfig(
  input: SessionRuntimeAuthInput = {},
): SessionRuntimeAuthConfig {
  const { mode, legacyEnvVar } = normalizeRuntimeMode(input.session_auth_mode);
  const option =
    SESSION_RUNTIME_AUTH_OPTIONS.find((candidate) => candidate.id === mode) ??
    SESSION_RUNTIME_AUTH_OPTIONS[0];

  return {
    mode,
    label: option.label,
    model: sanitizeModel(input.agent_model),
    anthropicApiKey:
      mode === "anthropic-api-key" && !legacyEnvVar
        ? sanitizeApiKey(input.anthropic_api_key)
        : null,
    agentApiKeyEnvVar:
      mode === "anthropic-api-key" && legacyEnvVar
        ? sanitizeEnvVarName(input.agent_api_key_env_var)
        : null,
    usesLegacyEnvVar: legacyEnvVar,
  };
}

export function buildSessionRuntimeAuthInstructions(
  config: SessionRuntimeAuthConfig,
): string {
  if (config.usesLegacyEnvVar) {
    return `Runtime execution: Anthropic API key from backend env ${config.agentApiKeyEnvVar}; model ${config.model}.`;
  }

  if (config.mode === "anthropic-api-key") {
    return `Runtime execution: Anthropic API (BYOK); model ${config.model}. The API key is provided transiently from the browser and is not stored by DevLog.`;
  }

  return `Runtime execution: Local code-agent CLI; model ${config.model}.`;
}

export function buildClaudeProcessEnv(
  baseEnv: NodeJS.ProcessEnv,
  config: SessionRuntimeAuthConfig,
):
  | { ok: true; env: NodeJS.ProcessEnv; error?: never }
  | { ok: false; env: NodeJS.ProcessEnv; error: string } {
  if (config.mode === "local-cli") {
    return { ok: true, env: baseEnv };
  }

  if (!config.usesLegacyEnvVar) {
    if (!config.anthropicApiKey) {
      return {
        ok: false,
        env: baseEnv,
        error:
          "Anthropic API key is required for BYOK execution. Add it in Settings on this browser.",
      };
    }

    return {
      ok: true,
      env: {
        ...baseEnv,
        ANTHROPIC_API_KEY: config.anthropicApiKey,
      },
    };
  }

  const envVar = config.agentApiKeyEnvVar ?? DEFAULT_AGENT_API_KEY_ENV_VAR;
  const key = baseEnv[envVar];
  if (!key) {
    return {
      ok: false,
      env: baseEnv,
      error: `Selected agent API key env var '${envVar}' is not set on the backend.`,
    };
  }

  return {
    ok: true,
    env: {
      ...baseEnv,
      ANTHROPIC_API_KEY: key,
    },
  };
}
