import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskRetryPrompt } from "../task-retry";
import { resolveAgentExecutionConfig } from "../agent-presets";
import { resolveSessionRuntimeAuthConfig } from "../session-runtime-auth";
import type { Task } from "../types-dashboard";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: "devlog",
    title: "Retry task",
    description: "Fix the workflow",
    status: "review",
    priority: "medium",
    worktree_name: "task-retry-task",
    session_id: "session-old",
    sort_order: 0,
    prompt: "Implement the requested change.",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

test("buildTaskRetryPrompt preserves Settings-derived execution and model context", () => {
  const prompt = buildTaskRetryPrompt({
    task: task(),
    project: {
      id: "devlog",
      name: "DevLog",
      path: "/repo",
      defaultBranch: "main",
    },
    worktreePath: "/repo-task",
    branchName: "task/retry-task",
    feedback: "Use the selected API model for the retry.",
    previousBrief: "Previous attempt touched the wrong route.",
    agentConfig: resolveAgentExecutionConfig({
      coding_agent_id: "backend-coding-agent",
      agent_team_id: "solo-coding-agent",
    }),
    runtimeAuthConfig: resolveSessionRuntimeAuthConfig({
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-test",
      agent_max_tokens: 12000,
    }),
  });

  assert.match(prompt, /## Agent Execution/);
  assert.match(prompt, /Coding agent: Backend Coding Agent/);
  assert.match(prompt, /Agent team: Solo Coding Agent/);
  assert.match(prompt, /Runtime execution: API \(BYOK, OpenAI API\); model gpt-4o-mini/);
  assert.match(prompt, /max output 12000 tokens/);
  assert.match(prompt, /## Previous Attempt Feedback/);
  assert.match(prompt, /Use the selected API model for the retry/);
  assert.match(prompt, /## Previous Session Summary/);
});
