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
  AGENT_MODEL_OPTIONS,
  type AgentSettings,
} from "@/core/agent-settings";
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
  runtimeSettings?: Pick<AgentSettings, "executionMode" | "model">;
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
  const modelLabel =
    AGENT_MODEL_OPTIONS.find((model) => model.id === runtimeSettings?.model)
      ?.label ?? "Claude Sonnet 4.6";
  const executionLabel =
    runtimeSettings?.executionMode === "anthropic-api"
      ? "Anthropic API (BYOK)"
      : "Local code-agent CLI";

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
  agentModel,
}: {
  codingAgentId?: string | null;
  agentTeamId?: string | null;
  sessionAuthMode?: string | null;
  agentApiKeyEnvVar?: string | null;
  agentModel?: string | null;
}) {
  const config = resolveAgentExecutionConfig({
    coding_agent_id: codingAgentId ?? DEFAULT_CODING_AGENT_ID,
    agent_team_id: agentTeamId ?? DEFAULT_AGENT_TEAM_ID,
  });
  const runtimeAuth = resolveSessionRuntimeAuthConfig({
    session_auth_mode: sessionAuthMode ?? DEFAULT_SESSION_AUTH_MODE,
    agent_api_key_env_var: agentApiKeyEnvVar,
    agent_model: agentModel ?? DEFAULT_AGENT_MODEL,
  });
  const modelLabel =
    AGENT_MODEL_OPTIONS.find((model) => model.id === runtimeAuth.model)
      ?.label ?? runtimeAuth.model;

  return (
    <>
      <Badge variant="secondary" className="text-[10px]">
        {config.codingAgent.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {config.agentTeam.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {runtimeAuth.usesLegacyEnvVar
          ? runtimeAuth.agentApiKeyEnvVar
          : runtimeAuth.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {modelLabel}
      </Badge>
    </>
  );
}
