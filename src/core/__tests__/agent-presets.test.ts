import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AGENT_TEAM_ID,
  DEFAULT_CODING_AGENT_ID,
  buildAgentExecutionInstructions,
  getAgentExecutionInputFromPayload,
  resolveAgentExecutionConfig,
} from "../agent-presets";
import { buildPromptTemplate } from "../task-lifecycle";
import type { Task } from "../types-dashboard";
import type { ProjectConfig } from "../types-project";

test("missing agent ids resolve to the implementation review team defaults", () => {
  const config = resolveAgentExecutionConfig({});

  assert.equal(config.codingAgent.id, DEFAULT_CODING_AGENT_ID);
  assert.equal(config.agentTeam.id, DEFAULT_AGENT_TEAM_ID);
  assert.equal(config.agentTeam.id, "implementation-review-team");
});

test("unknown agent ids fall back to safe defaults", () => {
  const config = resolveAgentExecutionConfig({
    coding_agent_id: "missing-agent",
    agent_team_id: "missing-team",
  });

  assert.equal(config.codingAgent.id, "general-coding-agent");
  assert.equal(config.agentTeam.id, "implementation-review-team");
});

test("agent execution payload parsing treats primitives as default config", () => {
  assert.deepEqual(getAgentExecutionInputFromPayload(null), {});
  assert.deepEqual(getAgentExecutionInputFromPayload("bad"), {});
  assert.deepEqual(getAgentExecutionInputFromPayload(["bad"]), {});
});

test("agent execution payload parsing keeps only string ids", () => {
  assert.deepEqual(
    getAgentExecutionInputFromPayload({
      coding_agent_id: "frontend-coding-agent",
      agent_team_id: 123,
    }),
    {
      coding_agent_id: "frontend-coding-agent",
      agent_team_id: null,
    },
  );
});

test("agent execution instructions include selected agent and team roles", () => {
  const config = resolveAgentExecutionConfig({
    coding_agent_id: "frontend-coding-agent",
    agent_team_id: "implementation-review-team",
  });

  const instructions = buildAgentExecutionInstructions(config);

  assert.match(instructions, /Frontend Coding Agent/);
  assert.match(instructions, /Implementation Agent/);
  assert.match(instructions, /Review Agent/);
  assert.match(instructions, /Test Agent/);
});

test("buildPromptTemplate includes agent execution instructions", () => {
  const task: Task = {
    id: "task-1",
    project_id: "devlog",
    title: "Improve session launch",
    description: "Let users choose how the task is handled.",
    status: "todo",
    priority: "medium",
    worktree_name: null,
    session_id: null,
    sort_order: 0,
    prompt: "Implement the smallest useful version.",
    created_at: "2026-05-25T00:00:00.000Z",
    updated_at: "2026-05-25T00:00:00.000Z",
    completed_at: null,
  };
  const project: ProjectConfig = {
    id: "devlog",
    name: "DevLog",
    path: "/repo/devlog",
    defaultBranch: "main",
  };
  const config = resolveAgentExecutionConfig({
    coding_agent_id: "backend-coding-agent",
    agent_team_id: "solo-coding-agent",
  });

  const prompt = buildPromptTemplate(
    task,
    project,
    "/repo/devlog/.worktrees/task",
    "task/task-1",
    config,
  );

  assert.match(prompt, /## Agent Execution/);
  assert.match(prompt, /Backend Coding Agent/);
  assert.match(prompt, /Solo Coding Agent/);
});
