export interface CodingAgentPreset {
  id: string;
  label: string;
  description: string;
  instruction: string;
}

export interface AgentTeamPreset {
  id: string;
  label: string;
  description: string;
  roles: string[];
}

export interface AgentExecutionConfig {
  codingAgent: CodingAgentPreset;
  agentTeam: AgentTeamPreset;
}

export interface AgentExecutionInput {
  coding_agent_id?: string | null;
  agent_team_id?: string | null;
}

export const DEFAULT_CODING_AGENT_ID = "general-coding-agent";
export const DEFAULT_AGENT_TEAM_ID = "implementation-review-team";

export const CODING_AGENTS: CodingAgentPreset[] = [
  {
    id: DEFAULT_CODING_AGENT_ID,
    label: "General Coding Agent",
    description: "Balanced implementation across frontend, backend, and tests.",
    instruction:
      "Work as a pragmatic general coding agent. Keep the change small, follow existing patterns, and verify before reporting completion.",
  },
  {
    id: "frontend-coding-agent",
    label: "Frontend Coding Agent",
    description: "Best for React UI, state, copy, and browser-facing workflows.",
    instruction:
      "Work as a frontend coding agent. Prioritize UI consistency, accessibility, responsive behavior, and browser-verifiable interactions.",
  },
  {
    id: "backend-coding-agent",
    label: "Backend Coding Agent",
    description: "Best for API routes, data contracts, process orchestration, and tests.",
    instruction:
      "Work as a backend coding agent. Prioritize typed contracts, boundary validation, persistence, process flow, and focused automated tests.",
  },
];

export const AGENT_TEAMS: AgentTeamPreset[] = [
  {
    id: DEFAULT_AGENT_TEAM_ID,
    label: "Implementation Review Team",
    description: "Implementation, review, and testing roles for task delivery.",
    roles: [
      "Implementation Agent: make the smallest code change that satisfies the task.",
      "Review Agent: inspect the result for regressions, scope creep, and missing requirements.",
      "Test Agent: run the relevant checks and summarize concrete evidence.",
    ],
  },
  {
    id: "solo-coding-agent",
    label: "Solo Coding Agent",
    description: "One coding agent executes the task end to end.",
    roles: [
      "Solo Coding Agent: implement, self-review, test, and report the result without creating extra roles.",
    ],
  },
];

export function resolveAgentExecutionConfig(
  input: AgentExecutionInput = {},
): AgentExecutionConfig {
  return {
    codingAgent:
      CODING_AGENTS.find((agent) => agent.id === input.coding_agent_id) ??
      CODING_AGENTS[0],
    agentTeam:
      AGENT_TEAMS.find((team) => team.id === input.agent_team_id) ??
      AGENT_TEAMS[0],
  };
}

export function getAgentExecutionInputFromPayload(
  payload: unknown,
): AgentExecutionInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  return {
    coding_agent_id:
      typeof record.coding_agent_id === "string"
        ? record.coding_agent_id
        : null,
    agent_team_id:
      typeof record.agent_team_id === "string" ? record.agent_team_id : null,
  };
}

export function buildAgentExecutionInstructions(
  config: AgentExecutionConfig,
): string {
  return [
    `Coding agent: ${config.codingAgent.label}`,
    config.codingAgent.instruction,
    "",
    `Agent team: ${config.agentTeam.label}`,
    config.agentTeam.description,
    ...config.agentTeam.roles.map((role) => `- ${role}`),
    "",
    "If parallel subagents are available, coordinate these roles explicitly. If not, perform the roles sequentially inside this session and label the handoffs clearly.",
  ].join("\n");
}
