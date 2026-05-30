import {
  KNOWN_API_PROVIDERS,
  type ApiProtocol,
} from "./agent-settings";
import type { SessionRuntimeAuthConfig } from "./session-runtime-auth";

export type ProviderRuntimeFailureKind =
  | "auth_failed"
  | "forbidden"
  | "not_found_model"
  | "invalid_base_url"
  | "rate_limited"
  | "upstream_unavailable"
  | "timeout"
  | "unknown";

export interface ProviderChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ParsedBaseUrl {
  url?: URL;
  error?: "invalid_base_url" | "forbidden";
}

export interface ProviderRuntimeSuccess {
  ok: true;
  content: string;
  latencyMs: number;
  status: number;
}

export interface ProviderRuntimeFailure {
  ok: false;
  kind: ProviderRuntimeFailureKind;
  error: string;
  latencyMs: number;
  status?: number;
}

export type ProviderRuntimeResult =
  | ProviderRuntimeSuccess
  | ProviderRuntimeFailure;

interface ProviderChatRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  extractText: (payload: unknown) => string;
}

const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000;
const AZURE_OPENAI_HOST_SUFFIX = ".openai.azure.com";

function elapsed(start: number): number {
  return Math.max(0, Date.now() - start);
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const parsed = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : null;
  });
  if (parsed.some((part) => part === null)) return null;
  return parsed as [number, number, number, number];
}

function normalizeHost(hostname: string): string {
  const stripped = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return stripped.toLowerCase().replace(/\.+$/, "");
}

export function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (host === "localhost" || host === "::1") return true;
  const ipv4 = parseIpv4(host);
  return Boolean(ipv4 && ipv4[0] === 127);
}

function isBlockedExternalHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  const ipv4 = parseIpv4(host);
  if (ipv4) {
    const [a, b] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return host === "::" || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host);
}

export function validateAgentConnectionBaseUrl(baseUrl: string): ParsedBaseUrl {
  let url: URL;
  try {
    url = new URL(baseUrl.trim().replace(/\/+$/, ""));
  } catch {
    return { error: "invalid_base_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "invalid_base_url" };
  }
  if (!isLoopbackHost(url.hostname) && isBlockedExternalHost(url.hostname)) {
    return { error: "forbidden" };
  }
  return { url };
}

function knownProviderBaseUrls(protocol: ApiProtocol): URL[] {
  return KNOWN_API_PROVIDERS.filter(
    (provider) => provider.protocol === protocol && provider.baseUrl,
  ).flatMap((provider) => {
    const validated = validateAgentConnectionBaseUrl(provider.baseUrl);
    return validated.url ? [validated.url] : [];
  });
}

function isAllowedKnownProviderBaseUrl(
  protocol: ApiProtocol,
  url: URL,
): boolean {
  const host = normalizeHost(url.hostname);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return knownProviderBaseUrls(protocol).some((allowed) => {
    const allowedPathname = allowed.pathname.replace(/\/+$/, "") || "/";
    return (
      url.protocol === allowed.protocol &&
      host === normalizeHost(allowed.hostname) &&
      (allowedPathname === "/" ||
        pathname === allowedPathname ||
        pathname.startsWith(`${allowedPathname}/`))
    );
  });
}

function isAllowedProviderBaseUrl(
  protocol: ApiProtocol,
  url: URL,
): boolean {
  if (protocol === "ollama" && isLoopbackHost(url.hostname)) {
    return true;
  }
  if (isAllowedKnownProviderBaseUrl(protocol, url)) {
    return true;
  }
  if (protocol === "azure") {
    return (
      url.protocol === "https:" &&
      normalizeHost(url.hostname).endsWith(AZURE_OPENAI_HOST_SUFFIX)
    );
  }
  return false;
}

export function validateProviderRuntimeConfig(
  config: SessionRuntimeAuthConfig,
):
  | { ok: true; baseUrl: URL }
  | { ok: false; kind: ProviderRuntimeFailureKind; error: string } {
  if (config.mode !== "anthropic-api-key") {
    return {
      ok: false,
      kind: "unknown",
      error: "Provider runtime requires API mode.",
    };
  }
  if (!config.baseUrl) {
    return {
      ok: false,
      kind: "invalid_base_url",
      error: "Base URL is required.",
    };
  }
  const validated = validateAgentConnectionBaseUrl(config.baseUrl);
  if (validated.error || !validated.url) {
    return {
      ok: false,
      kind: validated.error ?? "invalid_base_url",
      error:
        validated.error === "forbidden"
          ? "Internal API hosts are blocked."
          : "Invalid base URL.",
    };
  }
  if (!isAllowedProviderBaseUrl(config.apiProtocol, validated.url)) {
    return {
      ok: false,
      kind: "forbidden",
      error:
        "Provider base URL is not in DevLog's allowed provider list.",
    };
  }
  const apiKeyOptional =
    config.apiProtocol === "ollama" && isLoopbackHost(validated.url.hostname);
  if (!config.anthropicApiKey && !apiKeyOptional) {
    return {
      ok: false,
      kind: "auth_failed",
      error: "API key is required for this provider.",
    };
  }
  return { ok: true, baseUrl: validated.url };
}

export function buildProviderChatRequest(
  config: SessionRuntimeAuthConfig,
  baseUrl: URL,
  messages: ProviderChatMessage[],
  options: { maxTokens?: number } = {},
): ProviderChatRequest {
  const apiKey = config.anthropicApiKey?.trim() || null;
  const maxTokens = options.maxTokens ?? config.maxTokens;
  switch (config.apiProtocol) {
    case "anthropic":
      return {
        url: appendVersionedApiPath(baseUrl, "/messages"),
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey ?? "",
        },
        body: {
          model: config.model,
          max_tokens: maxTokens,
          messages,
        },
        extractText: extractAnthropicText,
      };
    case "openai":
    case "senseaudio":
      return {
        url: appendVersionedApiPath(baseUrl, "/chat/completions"),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey ?? ""}`,
        },
        body: {
          model: config.model,
          max_tokens: maxTokens,
          messages,
          stream: false,
        },
        extractText: extractOpenAIMessageText,
      };
    case "azure": {
      const url = new URL(baseUrl.toString());
      const basePath = url.pathname.replace(/\/+$/, "");
      const usesVersionedOpenAIPath = /\/openai\/v\d+(?:$|\/)/.test(basePath);
      const apiVersion =
        config.apiVersion || (usesVersionedOpenAIPath ? "" : "2024-10-21");
      url.pathname = usesVersionedOpenAIPath
        ? `${basePath}/chat/completions`
        : `${basePath}/openai/deployments/${encodeURIComponent(config.model)}/chat/completions`;
      if (apiVersion) {
        url.searchParams.set("api-version", apiVersion);
      } else {
        url.searchParams.delete("api-version");
      }
      return {
        url: url.toString(),
        headers: {
          "content-type": "application/json",
          "api-key": apiKey ?? "",
        },
        body: {
          ...(usesVersionedOpenAIPath ? { model: config.model } : {}),
          messages,
          stream: false,
          max_completion_tokens: maxTokens,
        },
        extractText: extractOpenAIMessageText,
      };
    }
    case "google":
      return {
        url: googleGenerateContentUrl(baseUrl, config.model),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey ?? "",
        },
        body: {
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: maxTokens },
        },
        extractText: extractGoogleText,
      };
    case "ollama": {
      const trimmedBase = baseUrl
        .toString()
        .replace(/\/+$/, "")
        .replace(/\/api\/?$/, "");
      return {
        url: `${trimmedBase}/api/chat`,
        headers: withOptionalAuth(
          { "content-type": "application/json" },
          apiKey,
        ),
        body: {
          model: config.model,
          messages,
          stream: false,
        },
        extractText: extractOllamaText,
      };
    }
  }
}

export async function runProviderChatCompletion(
  config: SessionRuntimeAuthConfig,
  messages: ProviderChatMessage[],
  options: {
    fetchImpl?: FetchImpl;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
): Promise<ProviderRuntimeResult> {
  const start = Date.now();
  const validated = validateProviderRuntimeConfig(config);
  if (!validated.ok) {
    return {
      ok: false,
      kind: validated.kind,
      error: validated.error,
      latencyMs: elapsed(start),
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const request = buildProviderChatRequest(config, validated.baseUrl, messages, {
      maxTokens: options.maxTokens ?? config.maxTokens,
    });
    // codeql[js/request-forgery] request.url is built from validateProviderRuntimeConfig's provider allowlist; private external hosts are rejected and loopback is only allowed for local Ollama.
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Status and empty-payload handling below still carry the result.
    }

    if (!response.ok) {
      const detail = redactSecrets(extractErrorDetail(payload), [
        config.anthropicApiKey,
      ]);
      return {
        ok: false,
        kind: classifyProviderFailure(response.status, detail),
        error: detail ?? `Provider request failed with ${response.status}.`,
        latencyMs: elapsed(start),
        status: response.status,
      };
    }

    const content = request.extractText(payload);
    if (!content) {
      return {
        ok: false,
        kind: "unknown",
        error: "Provider returned no assistant text.",
        latencyMs: elapsed(start),
        status: response.status,
      };
    }

    return {
      ok: true,
      content,
      latencyMs: elapsed(start),
      status: response.status,
    };
  } catch (error) {
    const aborted =
      error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "upstream_unavailable",
      error:
        error instanceof Error
          ? redactSecrets(error.message, [config.anthropicApiKey]) ??
            "Provider request failed."
          : "Provider request failed.",
      latencyMs: elapsed(start),
    };
  } finally {
    clearTimeout(timer);
  }
}

function appendVersionedApiPath(baseUrl: URL, suffix: string): string {
  const url = new URL(baseUrl.toString());
  const basePath = url.pathname.replace(/\/+$/, "");
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  url.pathname = basePath.endsWith("/v1")
    ? `${basePath}${normalizedSuffix}`
    : `${basePath}/v1${normalizedSuffix}`;
  return url.toString();
}

function googleGenerateContentUrl(baseUrl: URL, model: string): string {
  const url = new URL(baseUrl.toString());
  const basePath = url.pathname.replace(/\/+$/, "");
  const versionedBase = /\/v\d+(?:beta)?$/.test(basePath)
    ? basePath
    : `${basePath}/v1beta`;
  url.pathname = `${versionedBase}/models/${encodeURIComponent(model)}:generateContent`;
  return url.toString();
}

function withOptionalAuth(
  headers: Record<string, string>,
  key: string | null,
): Record<string, string> {
  if (!key) return headers;
  return {
    ...headers,
    authorization: `Bearer ${key}`,
  };
}

function extractAnthropicText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("")
    .trim();
}

function extractOpenAIMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as { message?: unknown }).message;
    const delta = (choice as { delta?: unknown }).delta;
    const content =
      message && typeof message === "object"
        ? (message as { content?: unknown }).content
        : delta && typeof delta === "object"
          ? (delta as { content?: unknown }).content
          : null;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
  }
  return "";
}

function extractGoogleText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  const parts = candidates
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== "object") return [];
      const parts = (content as { parts?: unknown }).parts;
      return Array.isArray(parts) ? parts : [];
    })
    .flat();
  return parts
    .map((part) =>
      part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("")
    .trim();
}

function extractOllamaText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const message = (payload as { message?: unknown }).message;
  if (message && typeof message === "object") {
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") return content.trim();
  }
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return "";
  return messages
    .map((item) =>
      item && typeof item === "object" && typeof (item as { content?: unknown }).content === "string"
        ? (item as { content: string }).content
        : "",
    )
    .join("")
    .trim();
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
  if (status === 401 || status === 403) return "auth_failed";
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
