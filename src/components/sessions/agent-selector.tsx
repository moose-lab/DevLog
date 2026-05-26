"use client";

import {
  AGENT_TEAMS,
  CODING_AGENTS,
  DEFAULT_AGENT_TEAM_ID,
  DEFAULT_CODING_AGENT_ID,
  resolveAgentExecutionConfig,
} from "@/core/agent-presets";
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
  onCodingAgentChange: (id: string) => void;
  onAgentTeamChange: (id: string) => void;
}

export function AgentSelector({
  codingAgentId,
  agentTeamId,
  onCodingAgentChange,
  onAgentTeamChange,
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
    </div>
  );
}

export function AgentExecutionBadges({
  codingAgentId,
  agentTeamId,
}: {
  codingAgentId?: string | null;
  agentTeamId?: string | null;
}) {
  const config = resolveAgentExecutionConfig({
    coding_agent_id: codingAgentId ?? DEFAULT_CODING_AGENT_ID,
    agent_team_id: agentTeamId ?? DEFAULT_AGENT_TEAM_ID,
  });

  return (
    <>
      <Badge variant="secondary" className="text-[10px]">
        {config.codingAgent.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {config.agentTeam.label}
      </Badge>
    </>
  );
}
