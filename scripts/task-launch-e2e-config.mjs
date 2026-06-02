const DEFAULT_API_BASE_URL_BY_PROTOCOL = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  azure: "",
  google: "https://generativelanguage.googleapis.com",
  ollama: "https://ollama.com",
  senseaudio: "https://api.senseaudio.cn",
};

const DEFAULT_API_MODEL_BY_PROTOCOL = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
  azure: "gpt-4o",
  google: "gemini-2.0-flash",
  ollama: "gemma3:4b",
  senseaudio: "senseaudio-s2",
};

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseMaxTokens(value) {
  const parsed = Number(nonEmpty(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8192;
}

function parseJsonObject(value) {
  const raw = nonEmpty(value);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function readByokApiKey(env) {
  const direct = nonEmpty(env.DEVLOG_E2E_API_KEY);
  if (direct) return direct;

  const envVarName =
    nonEmpty(env.DEVLOG_E2E_API_KEY_ENV_VAR) ??
    nonEmpty(env.DEVLOG_E2E_AGENT_API_KEY_ENV_VAR) ??
    "ANTHROPIC_API_KEY";
  return nonEmpty(env[envVarName]);
}

export function buildTaskLaunchRuntimePayload(env = process.env) {
  const mode = nonEmpty(env.DEVLOG_E2E_AUTH_MODE) ?? "local-cli";
  const model = nonEmpty(env.DEVLOG_E2E_AGENT_MODEL);

  if (mode === "agent-api-key") {
    return {
      session_auth_mode: "agent-api-key",
      agent_api_key_env_var:
        nonEmpty(env.DEVLOG_E2E_AGENT_API_KEY_ENV_VAR) ?? "ANTHROPIC_API_KEY",
      agent_model: model ?? "claude-sonnet-4-6",
    };
  }

  if (mode === "anthropic-api-key") {
    const protocol = nonEmpty(env.DEVLOG_E2E_API_PROTOCOL) ?? "anthropic";
    const apiKey = readByokApiKey(env);
    return {
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: protocol,
      agent_model:
        model ??
        DEFAULT_API_MODEL_BY_PROTOCOL[protocol] ??
        "claude-sonnet-4-5",
      agent_base_url:
        nonEmpty(env.DEVLOG_E2E_AGENT_BASE_URL) ??
        DEFAULT_API_BASE_URL_BY_PROTOCOL[protocol] ??
        "",
      agent_api_version: nonEmpty(env.DEVLOG_E2E_AGENT_API_VERSION) ?? "",
      agent_max_tokens: parseMaxTokens(env.DEVLOG_E2E_AGENT_MAX_TOKENS),
      ...(apiKey ? { anthropic_api_key: apiKey } : {}),
    };
  }

  const localCliEnv = parseJsonObject(env.DEVLOG_E2E_LOCAL_CLI_ENV_JSON);
  return {
    session_auth_mode: "local-cli",
    local_cli_agent_id:
      nonEmpty(env.DEVLOG_E2E_LOCAL_CLI_AGENT_ID) ??
      nonEmpty(env.DEVLOG_E2E_LOCAL_CLI_AGENT) ??
      "claude",
    agent_model: model ?? "default",
    agent_reasoning: nonEmpty(env.DEVLOG_E2E_AGENT_REASONING) ?? "medium",
    ...(localCliEnv ? { local_cli_agent_env: localCliEnv } : {}),
  };
}

export function describeTaskLaunchRuntimePayload(payload) {
  if (payload.session_auth_mode === "anthropic-api-key") {
    return [
      "mode=anthropic-api-key",
      `protocol=${payload.agent_api_protocol}`,
      `model=${payload.agent_model}`,
      `baseUrl=${payload.agent_base_url}`,
      `key=${payload.anthropic_api_key ? "provided" : "missing"}`,
    ].join(" ");
  }

  if (payload.session_auth_mode === "agent-api-key") {
    return [
      "mode=agent-api-key",
      `env=${payload.agent_api_key_env_var}`,
      `model=${payload.agent_model}`,
    ].join(" ");
  }

  return [
    "mode=local-cli",
    `agent=${payload.local_cli_agent_id}`,
    `model=${payload.agent_model}`,
    `reasoning=${payload.agent_reasoning}`,
  ].join(" ");
}
