"use client";

import {
  AGENT_TEAMS,
  CODING_AGENTS,
  DEFAULT_AGENT_TEAM_ID,
  DEFAULT_CODING_AGENT_ID,
  resolveAgentExecutionConfig,
} from "@/core/agent-presets";
import {
  DEFAULT_AGENT_API_KEY_ENV_VAR,
  DEFAULT_SESSION_AUTH_MODE,
  SESSION_RUNTIME_AUTH_OPTIONS,
  type SessionRuntimeAuthMode,
  resolveSessionRuntimeAuthConfig,
} from "@/core/session-runtime-auth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  sessionAuthMode: SessionRuntimeAuthMode;
  agentApiKeyEnvVar: string;
  onCodingAgentChange: (id: string) => void;
  onAgentTeamChange: (id: string) => void;
  onSessionAuthModeChange: (mode: SessionRuntimeAuthMode) => void;
  onAgentApiKeyEnvVarChange: (envVar: string) => void;
}

export function AgentSelector({
  codingAgentId,
  agentTeamId,
  sessionAuthMode,
  agentApiKeyEnvVar,
  onCodingAgentChange,
  onAgentTeamChange,
  onSessionAuthModeChange,
  onAgentApiKeyEnvVarChange,
}: AgentSelectorProps) {
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
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">LLM access</Label>
        <Select
          value={sessionAuthMode}
          onValueChange={(value) =>
            onSessionAuthModeChange(value as SessionRuntimeAuthMode)
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SESSION_RUNTIME_AUTH_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {sessionAuthMode === "agent-api-key" && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">API key env</Label>
          <Input
            className="h-9 font-mono text-xs"
            value={agentApiKeyEnvVar}
            onChange={(event) =>
              onAgentApiKeyEnvVarChange(event.currentTarget.value)
            }
            placeholder={DEFAULT_AGENT_API_KEY_ENV_VAR}
          />
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
}: {
  codingAgentId?: string | null;
  agentTeamId?: string | null;
  sessionAuthMode?: string | null;
  agentApiKeyEnvVar?: string | null;
}) {
  const config = resolveAgentExecutionConfig({
    coding_agent_id: codingAgentId ?? DEFAULT_CODING_AGENT_ID,
    agent_team_id: agentTeamId ?? DEFAULT_AGENT_TEAM_ID,
  });
  const runtimeAuth = resolveSessionRuntimeAuthConfig({
    session_auth_mode: sessionAuthMode ?? DEFAULT_SESSION_AUTH_MODE,
    agent_api_key_env_var: agentApiKeyEnvVar ?? DEFAULT_AGENT_API_KEY_ENV_VAR,
  });

  return (
    <>
      <Badge variant="secondary" className="text-[10px]">
        {config.codingAgent.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {config.agentTeam.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {runtimeAuth.mode === "agent-api-key"
          ? runtimeAuth.agentApiKeyEnvVar
          : runtimeAuth.label}
      </Badge>
    </>
  );
}
