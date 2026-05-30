import type { SessionRuntimeAuthConfig } from "./session-runtime-auth";
import {
  isLoopbackHost,
  type FetchImpl,
  type ProviderRuntimeFailureKind,
  validateProviderRuntimeConfig,
} from "./api-provider-runtime";

export interface ProviderModelsSuccess {
  ok: true;
  models: string[];
  latencyMs: number;
  status: number;
}

export interface ProviderModelsFailure {
  ok: false;
  kind: ProviderRuntimeFailureKind;
  detail: string;
  latencyMs: number;
  status?: number;
}

export type ProviderModelsResult =
  | ProviderModelsSuccess
  | ProviderModelsFailure;

interface ProviderModelsRequest {
  url: string;
  headers: Record<string, string>;
  extractModels: (payload: unknown) => string[];
}

const DEFAULT_PROVIDER_MODELS_TIMEOUT_MS = 20_000;

function elapsed(start: number): number {
  return Math.max(0, Date.now() - start);
}

export async function fetchProviderModels(
  config: SessionRuntimeAuthConfig,
  options: {
    fetchImpl?: FetchImpl;
    timeoutMs?: number;
  } = {},
): Promise<ProviderModelsResult> {
  const start = Date.now();
  const validated = validateProviderRuntimeConfig(config);
  if (!validated.ok) {
    return {
      ok: false,
      kind: validated.kind,
      detail: validated.error,
      latencyMs: elapsed(start),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_PROVIDER_MODELS_TIMEOUT_MS,
  );
  try {
    const request = buildProviderModelsRequest(config, validated.baseUrl);
    const response = await (options.fetchImpl ?? fetch)(request.url, {
      method: "GET",
      headers: request.headers,
      signal: controller.signal,
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Status handling below still carries the failure.
    }

    if (!response.ok) {
      const detail = redactSecrets(extractErrorDetail(payload), [
        config.anthropicApiKey,
      ]);
      return {
        ok: false,
        kind: classifyProviderFailure(response.status, detail),
        detail: detail ?? `Provider models request failed with ${response.status}.`,
        latencyMs: elapsed(start),
        status: response.status,
      };
    }

    return {
      ok: true,
      models: uniqueModels(request.extractModels(payload)),
      latencyMs: elapsed(start),
      status: response.status,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "upstream_unavailable",
      detail:
        error instanceof Error
          ? redactSecrets(error.message, [config.anthropicApiKey]) ??
            "Provider models request failed."
          : "Provider models request failed.",
      latencyMs: elapsed(start),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildProviderModelsRequest(
  config: SessionRuntimeAuthConfig,
  baseUrl: URL,
): ProviderModelsRequest {
  const apiKey = config.anthropicApiKey?.trim() || null;
  switch (config.apiProtocol) {
    case "anthropic":
      return {
        url: appendVersionedApiPath(baseUrl, "/models"),
        headers: {
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey ?? "",
        },
        extractModels: extractDataIdModels,
      };
    case "openai":
    case "senseaudio":
      return {
        url: appendVersionedApiPath(baseUrl, "/models"),
        headers: { authorization: `Bearer ${apiKey ?? ""}` },
        extractModels: extractDataIdModels,
      };
    case "azure": {
      const url = new URL(baseUrl.toString());
      const basePath = url.pathname.replace(/\/+$/, "");
      const usesVersionedOpenAIPath = /\/openai\/v\d+(?:$|\/)/.test(basePath);
      const apiVersion = config.apiVersion || "2024-10-21";
      url.pathname = usesVersionedOpenAIPath
        ? `${basePath}/models`
        : `${basePath}/openai/models`;
      if (usesVersionedOpenAIPath) {
        url.searchParams.delete("api-version");
      } else {
        url.searchParams.set("api-version", apiVersion);
      }
      return {
        url: url.toString(),
        headers: { "api-key": apiKey ?? "" },
        extractModels: extractDataIdModels,
      };
    }
    case "google":
      return {
        url: appendVersionedApiPath(baseUrl, "/models", "v1beta"),
        headers: { "x-goog-api-key": apiKey ?? "" },
        extractModels: extractGoogleModels,
      };
    case "ollama": {
      const trimmedBase = baseUrl
        .toString()
        .replace(/\/+$/, "")
        .replace(/\/api\/?$/, "");
      return {
        url: `${trimmedBase}/api/tags`,
        headers:
          apiKey || !isLoopbackHost(baseUrl.hostname)
            ? { authorization: `Bearer ${apiKey ?? ""}` }
            : {},
        extractModels: extractOllamaModels,
      };
    }
  }
}

function appendVersionedApiPath(
  baseUrl: URL,
  suffix: string,
  version = "v1",
): string {
  const url = new URL(baseUrl.toString());
  const basePath = url.pathname.replace(/\/+$/, "");
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  url.pathname = /\/v\d+(?:beta)?$/.test(basePath)
    ? `${basePath}${normalizedSuffix}`
    : `${basePath}/${version}${normalizedSuffix}`;
  return url.toString();
}

function extractDataIdModels(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((item) =>
      item &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string"
        ? (item as { id: string }).id
        : "",
    )
    .filter(Boolean);
}

function extractGoogleModels(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];
  return models
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const name = (item as { name?: unknown }).name;
      return typeof name === "string" ? name.replace(/^models\//, "") : "";
    })
    .filter(Boolean);
}

function extractOllamaModels(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];
  return models
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as { name?: unknown; model?: unknown };
      return typeof record.name === "string"
        ? record.name
        : typeof record.model === "string"
          ? record.model
          : "";
    })
    .filter(Boolean);
}

function uniqueModels(models: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function extractErrorDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return typeof record.message === "string" ? record.message : undefined;
}

function classifyProviderFailure(
  status: number,
  detail: string | undefined,
): ProviderRuntimeFailureKind {
  if (status === 401) return "auth_failed";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_unavailable";
  if (status === 404) return "not_found_model";
  if (status === 400 && /model/i.test(detail ?? "")) return "not_found_model";
  return "unknown";
}

function redactSecrets(
  text: string | undefined,
  secrets: Array<string | null>,
): string | undefined {
  if (!text) return text;
  let redacted = text;
  for (const secret of secrets) {
    const value = secret?.trim();
    if (!value) continue;
    redacted = redacted.split(value).join("[redacted]");
  }
  return redacted;
}
