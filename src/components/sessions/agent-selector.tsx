"use client";

import {
  AGENT_TEAMS,
  CODING_AGENTS,
  DEFAULT_AGENT_TEAM_ID,
  DEFAULT_CODING_AGENT_ID,
  resolveAgentExecutionConfig,
} from "@/core/agent-presets";
import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_SESSION_AUTH_MODE,
  resolveSessionRuntimeAuthConfig,
} from "@/core/session-runtime-auth";
import {
  API_PROTOCOL_LABELS,
  type AgentSettings,
} from "@/core/agent-settings";
import {
  DEFAULT_LOCAL_CLI_MODEL,
  DEFAULT_LOCAL_CLI_REASONING,
  LOCAL_CLI_AGENT_DEFINITIONS,
} from "@/core/local-cli-agent-definitions";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgentSelectorProps {
  codingAgentId: string;
  agentTeamId: string;
  runtimeSettings?: Pick<
    AgentSettings,
    | "executionMode"
    | "localCliAgentId"
    | "localCliModel"
    | "localCliReasoning"
    | "apiProtocol"
    | "apiModel"
    | "apiBaseUrl"
    | "apiMaxTokens"
  >;
  onCodingAgentChange: (id: string) => void;
  onAgentTeamChange: (id: string) => void;
}

export function AgentSelector({
  codingAgentId,
  agentTeamId,
  runtimeSettings,
  onCodingAgentChange,
  onAgentTeamChange,
}: AgentSelectorProps) {
  const localCliAgent = LOCAL_CLI_AGENT_DEFINITIONS.find(
    (agent) => agent.id === runtimeSettings?.localCliAgentId,
  );
  const executionLabel =
    runtimeSettings?.executionMode === "anthropic-api"
      ? `API: ${API_PROTOCOL_LABELS[runtimeSettings.apiProtocol]}`
      : `Local CLI${localCliAgent ? `: ${localCliAgent.name}` : ""}`;
  const modelLabel =
    runtimeSettings?.executionMode === "anthropic-api"
      ? runtimeSettings.apiModel
      : (localCliAgent?.models.find(
          (model) => model.id === runtimeSettings?.localCliModel,
        )?.label ??
        runtimeSettings?.localCliModel ??
        DEFAULT_LOCAL_CLI_MODEL.label);
  const reasoningLabel =
    runtimeSettings?.executionMode === "local-cli" &&
    runtimeSettings.localCliReasoning !== DEFAULT_LOCAL_CLI_REASONING
      ? (localCliAgent?.reasoningOptions?.find(
          (option) => option.id === runtimeSettings.localCliReasoning,
        )?.label ?? runtimeSettings.localCliReasoning)
      : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Coding agent</Label>
        <Select value={codingAgentId} onValueChange={onCodingAgentChange}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODING_AGENTS.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Agent team</Label>
        <Select value={agentTeamId} onValueChange={onAgentTeamChange}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGENT_TEAMS.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {runtimeSettings && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">
            Execution & model
          </Label>
          <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-2">
            <Badge variant="outline" className="text-[10px]">
              {executionLabel}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {modelLabel}
            </Badge>
            {reasoningLabel && (
              <Badge variant="outline" className="text-[10px]">
                {reasoningLabel}
              </Badge>
            )}
            {runtimeSettings.executionMode === "anthropic-api" && (
              <Badge variant="outline" className="text-[10px]">
                {runtimeSettings.apiMaxTokens.toLocaleString()} max
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentExecutionBadges({
  codingAgentId,
  agentTeamId,
  sessionAuthMode,
  agentApiKeyEnvVar,
  localCliAgentId,
  agentModel,
  agentReasoning,
  agentApiProtocol,
  agentApiVersion,
  agentBaseUrl,
  agentMaxTokens,
}: {
  codingAgentId?: string | null;
  agentTeamId?: string | null;
  sessionAuthMode?: string | null;
  agentApiKeyEnvVar?: string | null;
  localCliAgentId?: string | null;
  agentModel?: string | null;
  agentReasoning?: string | null;
  agentApiProtocol?: string | null;
  agentApiVersion?: string | null;
  agentBaseUrl?: string | null;
  agentMaxTokens?: number | null;
}) {
  const config = resolveAgentExecutionConfig({
    coding_agent_id: codingAgentId ?? DEFAULT_CODING_AGENT_ID,
    agent_team_id: agentTeamId ?? DEFAULT_AGENT_TEAM_ID,
  });
  const runtimeAuth = resolveSessionRuntimeAuthConfig({
    session_auth_mode: sessionAuthMode ?? DEFAULT_SESSION_AUTH_MODE,
    agent_api_key_env_var: agentApiKeyEnvVar,
    local_cli_agent_id: localCliAgentId,
    agent_model: agentModel ?? DEFAULT_AGENT_MODEL,
    agent_reasoning: agentReasoning,
    agent_api_protocol: agentApiProtocol,
    agent_api_version: agentApiVersion,
    agent_base_url: agentBaseUrl,
    agent_max_tokens: agentMaxTokens,
  });
  const localCliAgent = LOCAL_CLI_AGENT_DEFINITIONS.find(
    (agent) => agent.id === runtimeAuth.localCliAgentId,
  );
  const modelLabel =
    runtimeAuth.mode === "anthropic-api-key"
      ? runtimeAuth.model
      : (localCliAgent?.models.find((model) => model.id === runtimeAuth.model)
          ?.label ?? runtimeAuth.model);
  const executionLabel = runtimeAuth.usesLegacyEnvVar
    ? runtimeAuth.agentApiKeyEnvVar
    : runtimeAuth.mode === "local-cli"
      ? `Local CLI: ${runtimeAuth.localCliAgentName}`
      : `API: ${API_PROTOCOL_LABELS[runtimeAuth.apiProtocol]}`;
  const apiHost =
    runtimeAuth.mode === "anthropic-api-key" && runtimeAuth.baseUrl
      ? safeHostname(runtimeAuth.baseUrl)
      : null;

  return (
    <>
      <Badge variant="secondary" className="text-[10px]">
        {config.codingAgent.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {config.agentTeam.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {executionLabel}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {modelLabel}
      </Badge>
      {apiHost && (
        <Badge variant="outline" className="text-[10px]">
          {apiHost}
        </Badge>
      )}
      {runtimeAuth.mode === "anthropic-api-key" && runtimeAuth.apiVersion && (
        <Badge variant="outline" className="text-[10px]">
          {runtimeAuth.apiVersion}
        </Badge>
      )}
      {runtimeAuth.mode === "anthropic-api-key" && (
        <Badge variant="outline" className="text-[10px]">
          {runtimeAuth.maxTokens.toLocaleString()} max
        </Badge>
      )}
      {runtimeAuth.mode === "local-cli" &&
        runtimeAuth.reasoning !== DEFAULT_LOCAL_CLI_REASONING && (
          <Badge variant="outline" className="text-[10px]">
            {runtimeAuth.reasoning}
          </Badge>
        )}
    </>
  );
}

function safeHostname(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}
