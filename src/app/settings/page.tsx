"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Laptop,
  RefreshCw,
  Server,
  Terminal,
} from "lucide-react";
import {
  API_KEY_PLACEHOLDERS,
  API_PROTOCOL_LABELS,
  API_PROTOCOL_OPTIONS,
  DEFAULT_BASE_URL_BY_PROTOCOL,
  DEFAULT_API_MAX_TOKENS,
  DEFAULT_MODEL_BY_PROTOCOL,
  KNOWN_API_PROVIDERS,
  LOCAL_CLI_AGENT_ENV_FIELDS,
  MAX_API_MAX_TOKENS,
  MIN_API_MAX_TOKENS,
  SUGGESTED_MODELS_BY_PROTOCOL,
  type ApiProtocol,
  type AgentExecutionMode,
} from "@/core/agent-settings";
import { cn } from "@/core/dashboard-utils";
import {
  DEFAULT_LOCAL_CLI_AGENT_ID,
  DEFAULT_LOCAL_CLI_MODEL,
  DEFAULT_LOCAL_CLI_REASONING,
  LOCAL_CLI_AGENT_DEFINITIONS,
  SUPPORTED_LOCAL_CLI_AGENT_NAMES,
  getLocalCliAgentStatus,
  getLocalCliAgentStatusLabel,
  isLocalCliAgentRunnable,
  type LocalCliAgentDefinition,
  type LocalCliAgentStatus,
} from "@/core/local-cli-agent-definitions";
import { useAgentSettings } from "@/hooks/use-agent-settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LocalCliAgentView extends LocalCliAgentDefinition {
  available: boolean;
  path?: string;
  version?: string | null;
  status: LocalCliAgentStatus;
}

interface ConnectionTestResponse {
  ok: boolean;
  kind: string;
  latencyMs: number;
  model?: string;
  sample?: string;
  status?: number;
  agentName?: string;
  detail?: string;
}

type ConnectionTestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ConnectionTestResponse };

interface ProviderModelsResponse {
  ok: boolean;
  models?: string[];
  kind?: string;
  latencyMs?: number;
  status?: number;
  detail?: string;
}

type ProviderModelsState =
  | { status: "idle"; models: string[] }
  | { status: "running"; models: string[] }
  | { status: "done"; models: string[]; latencyMs: number }
  | { status: "error"; models: string[]; detail: string; kind?: string };

const FALLBACK_LOCAL_CLI_AGENTS: LocalCliAgentView[] =
  LOCAL_CLI_AGENT_DEFINITIONS.map((agent) => ({
    ...agent,
    available: false,
    version: null,
    status: "not-installed",
  }));
const CUSTOM_MODEL_VALUE = "__custom_model__";
const DEFAULT_CUSTOM_MODEL_ID = "custom-model";

function buildLocalCliScanEnv(
  value: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const field of LOCAL_CLI_AGENT_ENV_FIELDS) {
    if (!field.envKey.endsWith("_BIN")) continue;
    const configured = value[field.agentId]?.[field.envKey]?.trim();
    if (!configured) continue;
    result[field.agentId] = {
      ...(result[field.agentId] ?? {}),
      [field.envKey]: configured,
    };
  }
  return result;
}

const EXECUTION_OPTIONS: Array<{
  id: AgentExecutionMode;
  label: string;
  description: string;
  icon: typeof Laptop;
}> = [
  {
    id: "local-cli",
    label: "Local CLI",
    description: "Run through a code-agent CLI detected on this machine.",
    icon: Laptop,
  },
  {
    id: "anthropic-api",
    label: "API",
    description: "Test provider credentials through protocol-specific BYOK calls.",
    icon: Server,
  },
];

function normalizeAgentsPayload(value: unknown): LocalCliAgentView[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return FALLBACK_LOCAL_CLI_AGENTS;
  }

  const agents = (value as { agents?: unknown }).agents;
  if (!Array.isArray(agents)) {
    return FALLBACK_LOCAL_CLI_AGENTS;
  }

  return (agents as LocalCliAgentView[]).map((agent) => ({
    ...agent,
    status: agent.status ?? getLocalCliAgentStatus(agent),
  }));
}

function normalizeConnectionTestResponse(
  value: unknown,
  fallbackLatencyMs: number,
): ConnectionTestResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      kind: "unknown",
      latencyMs: fallbackLatencyMs,
      detail: "Invalid connection test response",
    };
  }
  const record = value as Record<string, unknown>;
  return {
    ok: record.ok === true,
    kind: typeof record.kind === "string" ? record.kind : "unknown",
    latencyMs:
      typeof record.latencyMs === "number"
        ? record.latencyMs
        : fallbackLatencyMs,
    model: typeof record.model === "string" ? record.model : undefined,
    sample: typeof record.sample === "string" ? record.sample : undefined,
    status: typeof record.status === "number" ? record.status : undefined,
    agentName:
      typeof record.agentName === "string" ? record.agentName : undefined,
    detail: typeof record.detail === "string" ? record.detail : undefined,
  };
}

function formatLatency(latencyMs: number): string {
  if (latencyMs < 1000) return `${Math.round(latencyMs)}ms`;
  return `${(latencyMs / 1000).toFixed(1)}s`;
}

function connectionTestKindLabel(kind: string): string {
  switch (kind) {
    case "auth_failed":
      return "Authentication failed";
    case "forbidden":
      return "Host blocked";
    case "not_found_model":
      return "Model unavailable";
    case "invalid_base_url":
      return "Invalid base URL";
    case "rate_limited":
      return "Rate limited";
    case "upstream_unavailable":
      return "Provider unavailable";
    case "timeout":
      return "Timed out";
    case "agent_not_installed":
      return "CLI not installed";
    case "agent_spawn_failed":
      return "CLI launch failed";
    default:
      return "Connection failed";
  }
}

function connectionTestMessage(result: ConnectionTestResponse): string {
  if (result.ok) {
    const target = result.agentName ?? result.model ?? "runtime";
    const sample = result.sample ? ` · ${result.sample}` : "";
    return `${target} connected in ${formatLatency(result.latencyMs)}${sample}`;
  }
  const detail = result.detail ? `: ${result.detail}` : "";
  return `${connectionTestKindLabel(result.kind)}${detail}`;
}

function normalizeProviderModelsResponse(
  value: unknown,
  fallbackLatencyMs: number,
): ProviderModelsResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      latencyMs: fallbackLatencyMs,
      detail: "Invalid provider models response",
    };
  }
  const record = value as Record<string, unknown>;
  return {
    ok: record.ok === true,
    models: Array.isArray(record.models)
      ? record.models.filter(
          (model): model is string => typeof model === "string",
        )
      : undefined,
    kind: typeof record.kind === "string" ? record.kind : undefined,
    latencyMs:
      typeof record.latencyMs === "number"
        ? record.latencyMs
        : fallbackLatencyMs,
    status: typeof record.status === "number" ? record.status : undefined,
    detail: typeof record.detail === "string" ? record.detail : undefined,
  };
}

function providerModelsMessage(state: ProviderModelsState): string {
  switch (state.status) {
    case "running":
      return "Loading models...";
    case "done": {
      const count = state.models.length;
      const noun = count === 1 ? "model" : "models";
      return `${count} ${noun} loaded in ${formatLatency(state.latencyMs)}`;
    }
    case "error":
      return state.detail;
    case "idle":
      return "";
  }
}

export default function SettingsPage() {
  const { settings, setSettings, runtimePayload, byokReady } =
    useAgentSettings();
  const [showApiKey, setShowApiKey] = useState(false);
  const [agents, setAgents] = useState<LocalCliAgentView[]>(
    FALLBACK_LOCAL_CLI_AGENTS,
  );
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestState>({
    status: "idle",
  });
  const [providerModels, setProviderModels] = useState<ProviderModelsState>({
    status: "idle",
    models: [],
  });

  const loadAgents = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    try {
      const response = await fetch("/api/agents/local-cli", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          local_cli_agent_env: buildLocalCliScanEnv(
            settings.localCliAgentEnv,
          ),
        }),
      });
      if (!response.ok) {
        throw new Error(`scan failed: ${response.status}`);
      }
      setAgents(normalizeAgentsPayload(await response.json()));
    } catch (error) {
      setAgents(FALLBACK_LOCAL_CLI_AGENTS);
      setScanError(error instanceof Error ? error.message : "scan failed");
    } finally {
      setScanning(false);
    }
  }, [settings.localCliAgentEnv]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    setConnectionTest({ status: "idle" });
  }, [
    settings.executionMode,
    settings.localCliAgentId,
    settings.localCliModel,
    settings.localCliReasoning,
    settings.apiProtocol,
    settings.apiModel,
    settings.apiBaseUrl,
    settings.apiVersion,
    settings.apiMaxTokens,
    settings.anthropicApiKey,
  ]);

  useEffect(() => {
    setProviderModels({ status: "idle", models: [] });
  }, [
    settings.executionMode,
    settings.apiProtocol,
    settings.apiBaseUrl,
    settings.apiVersion,
    settings.anthropicApiKey,
  ]);

  const runConnectionTest = useCallback(async () => {
    setConnectionTest({ status: "running" });
    const start = Date.now();
    try {
      const response = await fetch("/api/agents/connection-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(runtimePayload),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error)
            : `connection test failed: ${response.status}`,
        );
      }
      setConnectionTest({
        status: "done",
        result: normalizeConnectionTestResponse(
          payload,
          Date.now() - start,
        ),
      });
    } catch (error) {
      setConnectionTest({
        status: "done",
        result: {
          ok: false,
          kind: "unknown",
          latencyMs: Date.now() - start,
          detail:
            error instanceof Error ? error.message : "Connection test failed",
        },
      });
    }
  }, [runtimePayload]);

  const loadProviderModels = useCallback(async () => {
    setProviderModels((current) => ({
      status: "running",
      models: current.models,
    }));
    const start = Date.now();
    try {
      const response = await fetch("/api/agents/provider-models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(runtimePayload),
      });
      const payload = normalizeProviderModelsResponse(
        await response.json().catch(() => null),
        Date.now() - start,
      );
      if (!response.ok || !payload.ok) {
        setProviderModels((current) => ({
          status: "error",
          models: current.models,
          kind: payload.kind,
          detail:
            payload.detail ??
            (payload.kind
              ? connectionTestKindLabel(payload.kind)
              : "Could not load models"),
        }));
        return;
      }
      setProviderModels({
        status: "done",
        models: payload.models ?? [],
        latencyMs: payload.latencyMs ?? Date.now() - start,
      });
    } catch (error) {
      setProviderModels((current) => ({
        status: "error",
        models: current.models,
        detail: error instanceof Error ? error.message : "Could not load models",
      }));
    }
  }, [runtimePayload]);

  const selectedAgent = useMemo(
    () =>
      agents.find((agent) => agent.id === settings.localCliAgentId) ??
      agents.find((agent) => agent.id === DEFAULT_LOCAL_CLI_AGENT_ID) ??
      agents[0],
    [agents, settings.localCliAgentId],
  );

  const selectedAgentAvailable = Boolean(selectedAgent?.available);
  const selectedAgentRunnable = selectedAgent
    ? isLocalCliAgentRunnable(selectedAgent)
    : false;
  const selectedAgentEnvFields = useMemo(
    () =>
      selectedAgent
        ? LOCAL_CLI_AGENT_ENV_FIELDS.filter(
            (field) => field.agentId === selectedAgent.id,
          )
        : [],
    [selectedAgent],
  );
  const selectedLocalModel = useMemo(
    () =>
      selectedAgent?.models.find(
        (model) => model.id === settings.localCliModel,
      ) ?? selectedAgent?.models[0],
    [selectedAgent, settings.localCliModel],
  );
  const selectedReasoning = useMemo(
    () =>
      selectedAgent?.reasoningOptions?.find(
        (option) => option.id === settings.localCliReasoning,
      ) ?? selectedAgent?.reasoningOptions?.[0],
    [selectedAgent, settings.localCliReasoning],
  );
  const apiProviders = useMemo(
    () =>
      KNOWN_API_PROVIDERS.filter(
        (provider) => provider.protocol === settings.apiProtocol,
      ),
    [settings.apiProtocol],
  );
  const suggestedApiModels = useMemo(
    () =>
      Array.from(
        new Set([
          ...SUGGESTED_MODELS_BY_PROTOCOL[settings.apiProtocol],
          ...apiProviders.flatMap((provider) => provider.models ?? [provider.model]),
          ...providerModels.models,
        ].filter(Boolean)),
      ),
    [apiProviders, providerModels.models, settings.apiProtocol],
  );
  const localModelSelectValue = selectedLocalModel
    ? settings.localCliModel
    : CUSTOM_MODEL_VALUE;

  const chooseAgent = (agent: LocalCliAgentView) => {
    if (!isLocalCliAgentRunnable(agent)) return;
    const savedChoice = settings.localCliAgentModels[agent.id];
    const defaultReasoning =
      agent.reasoningOptions?.some(
        (option) => option.id === DEFAULT_LOCAL_CLI_REASONING,
      )
        ? DEFAULT_LOCAL_CLI_REASONING
        : agent.reasoningOptions?.[0]?.id ?? DEFAULT_LOCAL_CLI_REASONING;
    setSettings({
      localCliAgentId: agent.id,
      localCliModel:
        savedChoice?.model ?? agent.models[0]?.id ?? DEFAULT_LOCAL_CLI_MODEL.id,
      localCliReasoning: savedChoice?.reasoning ?? defaultReasoning,
    });
  };

  const updateLocalCliAgentEnv = (
    agentId: string,
    envKey: string,
    rawValue: string,
  ) => {
    const value = rawValue.trim();
    const localCliAgentEnv = { ...settings.localCliAgentEnv };
    const nextAgentEnv = { ...(localCliAgentEnv[agentId] ?? {}) };
    if (value) {
      nextAgentEnv[envKey] = value;
    } else {
      delete nextAgentEnv[envKey];
    }
    if (Object.keys(nextAgentEnv).length > 0) {
      localCliAgentEnv[agentId] = nextAgentEnv;
    } else {
      delete localCliAgentEnv[agentId];
    }
    setSettings({ localCliAgentEnv });
  };

  const chooseApiProtocol = (apiProtocol: ApiProtocol) => {
    const saved = settings.apiProtocolConfigs[apiProtocol];
    const provider = KNOWN_API_PROVIDERS.find(
      (candidate) => candidate.protocol === apiProtocol,
    );
    setSettings({
      apiProtocol,
      apiModel:
        saved?.apiModel ||
        provider?.model ||
        DEFAULT_MODEL_BY_PROTOCOL[apiProtocol],
      apiBaseUrl:
        saved?.apiBaseUrl ??
        provider?.baseUrl ??
        DEFAULT_BASE_URL_BY_PROTOCOL[apiProtocol],
      apiVersion:
        saved?.apiVersion ?? (apiProtocol === "azure" ? "2024-10-21" : ""),
      apiMaxTokens: saved?.apiMaxTokens ?? DEFAULT_API_MAX_TOKENS,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure how DevLog launches coding agents for Tasks and Sessions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution & model</CardTitle>
          <CardDescription>
            Local CLI and API execution are separate modes with independent
            configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {EXECUTION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = settings.executionMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "flex min-h-[104px] items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/20 hover:bg-muted/40",
                  )}
                  onClick={() => setSettings({ executionMode: option.id })}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                      selected
                        ? "border-primary/40 bg-primary/20 text-primary"
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {option.label}
                      {selected && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {settings.executionMode === "local-cli" ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-1.5 text-sm font-medium">
                    Local CLI registry
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="View supported Local CLI scope"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        align="start"
                        sideOffset={6}
                        className="max-w-xs text-left leading-5"
                      >
                        Current support scope:{" "}
                        {SUPPORTED_LOCAL_CLI_AGENT_NAMES.join(", ")}. Other
                        local CLIs are ignored in this phase.
                      </TooltipContent>
                    </Tooltip>
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Detected by scanning your PATH against DevLog's current
                    supported registry.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadAgents}
                  disabled={scanning}
                >
                  <RefreshCw
                    className={cn("h-4 w-4", scanning && "animate-spin")}
                  />
                  Rescan
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {agents.map((agent) => {
                  const selected = settings.localCliAgentId === agent.id;
                  const status =
                    agent.status ?? getLocalCliAgentStatus(agent);
                  const runnable = status === "available";
                  const statusLabel = getLocalCliAgentStatusLabel(status);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      disabled={!runnable}
                      onClick={() => chooseAgent(agent)}
                      className={cn(
                        "flex min-h-[116px] items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        selected && runnable
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/20",
                        runnable
                          ? "hover:bg-muted/40"
                          : "cursor-not-allowed opacity-65",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                          selected && runnable
                            ? "border-primary/40 bg-primary/20 text-primary"
                            : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        <Terminal className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {agent.name}
                          </span>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] leading-4",
                              status === "available"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                : status === "runner-pending"
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                                  : "border-border bg-muted/40 text-muted-foreground",
                            )}
                          >
                            {statusLabel}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Binary: <span className="font-mono">{agent.bin}</span>
                        </span>
                        {agent.path && (
                          <span className="mt-1 block break-all font-mono text-[10px] leading-4 text-muted-foreground">
                            {agent.path}
                          </span>
                        )}
                        {agent.version && (
                          <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                            {agent.version}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="local-cli-model">Model</Label>
                  <Select
                    value={localModelSelectValue}
                    disabled={!selectedAgentRunnable}
                    onValueChange={(localCliModel) =>
                      setSettings({
                        localCliModel:
                          localCliModel === CUSTOM_MODEL_VALUE
                            ? DEFAULT_CUSTOM_MODEL_ID
                            : localCliModel,
                      })
                    }
                  >
                    <SelectTrigger id="local-cli-model" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(selectedAgent?.models ?? [DEFAULT_LOCAL_CLI_MODEL]).map(
                        (model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label}
                          </SelectItem>
                        ),
                      )}
                      <SelectItem value={CUSTOM_MODEL_VALUE}>
                        Custom...
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {selectedLocalModel?.label ?? "Custom model id"}
                  </p>
                </div>

                {selectedAgent?.reasoningOptions ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="local-cli-reasoning">Intelligence</Label>
                    <Select
                      value={settings.localCliReasoning}
                      disabled={!selectedAgentRunnable}
                      onValueChange={(localCliReasoning) =>
                        setSettings({ localCliReasoning })
                      }
                    >
                      <SelectTrigger id="local-cli-reasoning" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedAgent.reasoningOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {selectedReasoning?.label ?? "Medium"}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-end">
                    <p className="text-xs text-muted-foreground">
                      This CLI uses its own configured intelligence behavior.
                    </p>
                  </div>
                )}
              </div>

              {!selectedLocalModel && selectedAgentRunnable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="local-cli-custom-model">Custom model</Label>
                  <Input
                    id="local-cli-custom-model"
                    value={settings.localCliModel}
                    onChange={(event) =>
                      setSettings({ localCliModel: event.currentTarget.value })
                    }
                    placeholder="provider/model-id"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use any model id accepted by the selected CLI.
                  </p>
                </div>
              ) : null}

              {selectedAgent && selectedAgentEnvFields.length > 0 ? (
                <details className="rounded-lg border border-border bg-muted/15 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Advanced: proxy & custom paths
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Values here are sent only when this local CLI is scanned
                      or launched.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {selectedAgentEnvFields.map((field) => (
                        <div
                          key={`${field.agentId}:${field.envKey}`}
                          className="space-y-1.5"
                        >
                          <Label htmlFor={`local-cli-env-${field.envKey}`}>
                            {field.label}
                          </Label>
                          <Input
                            id={`local-cli-env-${field.envKey}`}
                            type={field.secret ? "password" : "text"}
                            value={
                              settings.localCliAgentEnv[field.agentId]?.[
                                field.envKey
                              ] ?? ""
                            }
                            onChange={(event) =>
                              updateLocalCliAgentEnv(
                                field.agentId,
                                field.envKey,
                                event.currentTarget.value,
                              )
                            }
                            placeholder={field.placeholder}
                            className="font-mono text-xs"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      selectedAgentRunnable ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                  {selectedAgentRunnable
                    ? `${selectedAgent?.name} is in the supported registry and available`
                    : selectedAgentAvailable
                      ? "Selected CLI is in the supported registry, but its DevLog runner is pending"
                      : "Selected CLI is in the supported registry, but was not detected on PATH"}
                </span>
                {scanError && (
                  <span className="inline-flex items-center gap-1.5 text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {scanError}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 border-t border-border pt-5">
              <div className="flex flex-wrap gap-2">
                {API_PROTOCOL_OPTIONS.map((protocol) => {
                  const selected = settings.apiProtocol === protocol.id;
                  return (
                    <button
                      key={protocol.id}
                      type="button"
                      onClick={() => chooseApiProtocol(protocol.id)}
                      className={cn(
                        "min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      {protocol.title}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="api-model">API model</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={loadProviderModels}
                      disabled={providerModels.status === "running"}
                      className="h-8 px-2 text-xs"
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5",
                          providerModels.status === "running" &&
                            "animate-spin",
                        )}
                      />
                      Load models
                    </Button>
                  </div>
                  <Input
                    id="api-model"
                    value={settings.apiModel}
                    list="api-model-suggestions"
                    onChange={(event) =>
                      setSettings({ apiModel: event.currentTarget.value })
                    }
                    className="font-mono text-xs"
                  />
                  <datalist id="api-model-suggestions">
                    {suggestedApiModels.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">
                    Use any model id accepted by the selected{" "}
                    {API_PROTOCOL_LABELS[settings.apiProtocol]} endpoint.
                  </p>
                  {providerModels.status !== "idle" ? (
                    <p
                      className={cn(
                        "text-xs",
                        providerModels.status === "error"
                          ? providerModels.kind === "rate_limited"
                            ? "text-amber-600"
                            : "text-destructive"
                          : "text-muted-foreground",
                      )}
                      role="status"
                      aria-live="polite"
                    >
                      {providerModelsMessage(providerModels)}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="api-max-tokens">Max output tokens</Label>
                  <Input
                    id="api-max-tokens"
                    type="number"
                    min={MIN_API_MAX_TOKENS}
                    max={MAX_API_MAX_TOKENS}
                    step={1}
                    value={settings.apiMaxTokens}
                    onChange={(event) =>
                      setSettings({
                        apiMaxTokens: event.currentTarget.valueAsNumber,
                      })
                    }
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Bounds provider `max_tokens` between{" "}
                    {MIN_API_MAX_TOKENS.toLocaleString()} and{" "}
                    {MAX_API_MAX_TOKENS.toLocaleString()}.
                  </p>
                </div>

              <div className="space-y-1.5">
                <Label htmlFor="anthropic-api-key">
                  {API_PROTOCOL_LABELS[settings.apiProtocol]} key
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="anthropic-api-key"
                      type={showApiKey ? "text" : "password"}
                      value={settings.anthropicApiKey}
                      onChange={(event) =>
                        setSettings({
                          anthropicApiKey: event.currentTarget.value,
                        })
                      }
                      placeholder={API_KEY_PLACEHOLDERS[settings.apiProtocol]}
                      className="pl-9 font-mono text-xs"
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    onClick={() => setShowApiKey((value) => !value)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your API key is stored only in this browser.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api-base-url">Base URL</Label>
                <Input
                  id="api-base-url"
                  value={settings.apiBaseUrl}
                  onChange={(event) =>
                    setSettings({ apiBaseUrl: event.currentTarget.value })
                  }
                  placeholder={
                    DEFAULT_BASE_URL_BY_PROTOCOL[settings.apiProtocol] ||
                    "https://resource.openai.azure.com"
                  }
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {API_PROTOCOL_LABELS[settings.apiProtocol]} endpoint used by
                  this browser session.
                </p>
              </div>

              {settings.apiProtocol === "azure" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="api-version">API version</Label>
                  <Input
                    id="api-version"
                    value={settings.apiVersion}
                    onChange={(event) =>
                      setSettings({ apiVersion: event.currentTarget.value })
                    }
                    placeholder="2024-10-21"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Azure deployments require an explicit API version unless
                    the base URL already uses `/openai/v1`.
                  </p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="api-provider">Quick fill provider</Label>
                <Select
                  value=""
                  onValueChange={(value) => {
                    const provider = apiProviders[Number(value)];
                    if (provider) {
                      setSettings({
                        apiProtocol: provider.protocol,
                        apiBaseUrl: provider.baseUrl,
                        apiModel: provider.model,
                        apiVersion:
                          provider.protocol === "azure" ? "2024-10-21" : "",
                        apiMaxTokens: DEFAULT_API_MAX_TOKENS,
                      });
                    }
                  }}
                >
                  <SelectTrigger id="api-provider" className="h-9">
                    <SelectValue placeholder="Choose a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {apiProviders.map((provider, index) => (
                      <SelectItem key={provider.label} value={String(index)}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Prefills model and base URL; API key stays browser-only.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      byokReady ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                  {byokReady
                    ? "API configuration ready for connection tests"
                    : "API key, model, and base URL are required before launching BYOK sessions"}
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground md:col-span-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Connection tests and API sessions use{" "}
                  {API_PROTOCOL_LABELS[settings.apiProtocol]} directly. Local
                  file and shell tool execution remains available through Local
                  CLI mode.
                </span>
              </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runConnectionTest}
              disabled={connectionTest.status === "running"}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  connectionTest.status === "running" && "animate-spin",
                )}
              />
              Test connection
            </Button>
            <div
              className="min-w-0 flex-1 text-xs"
              role="status"
              aria-live="polite"
            >
              {connectionTest.status === "done" ? (
                <span
                  className={cn(
                    "inline-flex max-w-full items-start gap-1.5",
                    connectionTest.result.ok
                      ? "text-emerald-600"
                      : connectionTest.result.kind === "rate_limited"
                        ? "text-amber-600"
                        : "text-destructive",
                  )}
                >
                  {connectionTest.result.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 break-words">
                    {connectionTestMessage(connectionTest.result)}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
