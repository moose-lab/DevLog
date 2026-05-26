export type SessionRuntimeAuthMode = "backend-oauth" | "agent-api-key";

export interface SessionRuntimeAuthOption {
  id: SessionRuntimeAuthMode;
  label: string;
  description: string;
}

export interface SessionRuntimeAuthInput {
  session_auth_mode?: string | null;
  agent_api_key_env_var?: string | null;
}

export interface SessionRuntimeAuthConfig {
  mode: SessionRuntimeAuthMode;
  label: string;
  agentApiKeyEnvVar: string | null;
}

export const DEFAULT_SESSION_AUTH_MODE: SessionRuntimeAuthMode =
  "backend-oauth";
export const DEFAULT_AGENT_API_KEY_ENV_VAR = "ANTHROPIC_API_KEY";

export const SESSION_RUNTIME_AUTH_OPTIONS: SessionRuntimeAuthOption[] = [
  {
    id: "backend-oauth",
    label: "Backend OAuth",
    description: "Use the authenticated Claude Code backend session.",
  },
  {
    id: "agent-api-key",
    label: "Agent API Key",
    description: "Use a backend environment variable as the agent API key.",
  },
];

const ENV_VAR_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

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
  };
}

export function resolveSessionRuntimeAuthConfig(
  input: SessionRuntimeAuthInput = {},
): SessionRuntimeAuthConfig {
  const mode: SessionRuntimeAuthMode =
    input.session_auth_mode === "agent-api-key"
      ? "agent-api-key"
      : DEFAULT_SESSION_AUTH_MODE;
  const option =
    SESSION_RUNTIME_AUTH_OPTIONS.find((candidate) => candidate.id === mode) ??
    SESSION_RUNTIME_AUTH_OPTIONS[0];

  return {
    mode,
    label: option.label,
    agentApiKeyEnvVar:
      mode === "agent-api-key"
        ? sanitizeEnvVarName(input.agent_api_key_env_var)
        : null,
  };
}

export function buildSessionRuntimeAuthInstructions(
  config: SessionRuntimeAuthConfig,
): string {
  if (config.mode === "agent-api-key") {
    return `Runtime auth: Agent API key from backend env ${config.agentApiKeyEnvVar}.`;
  }

  return "Runtime auth: Backend OAuth.";
}

export function buildClaudeProcessEnv(
  baseEnv: NodeJS.ProcessEnv,
  config: SessionRuntimeAuthConfig,
):
  | { ok: true; env: NodeJS.ProcessEnv; error?: never }
  | { ok: false; env: NodeJS.ProcessEnv; error: string } {
  if (config.mode === "backend-oauth") {
    return { ok: true, env: baseEnv };
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
