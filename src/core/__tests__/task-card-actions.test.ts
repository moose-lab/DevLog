import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canExecuteTaskFromCard,
  canPauseTaskFromCard,
} from "../../components/kanban/task-card-actions";
import type { Session, Task } from "../types-dashboard";

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    project_id: "devlog",
    title: "Task",
    description: null,
    status: "todo",
    priority: "medium",
    worktree_name: null,
    session_id: null,
    sort_order: 0,
    prompt: null,
    created_at: "2026-05-25T00:00:00.000Z",
    updated_at: "2026-05-25T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

function session(overrides: Partial<Session>): Session {
  return {
    id: "session-1",
    project_id: "devlog",
    task_id: "task-1",
    worktree_name: null,
    worktree_path: null,
    branch_name: null,
    pid: null,
    status: "running",
    claude_command: null,
    claude_session_id: null,
    coding_agent_id: "general-coding-agent",
    agent_team_id: "implementation-review-team",
    session_auth_mode: "backend-oauth",
    agent_api_key_env_var: null,
    agent_model: "claude-sonnet-4-6",
    prompt: null,
    exit_code: null,
    log_path: null,
    started_at: "2026-05-25T00:00:00.000Z",
    ended_at: null,
    ...overrides,
  };
}

test("todo cards can execute even when they have no prompt", () => {
  assert.equal(canExecuteTaskFromCard(task({ status: "todo", prompt: null })), true);
});

test("historical sessions do not hide the execute button", () => {
  assert.equal(
    canExecuteTaskFromCard(task({ status: "todo", prompt: "Run it" }), session({ status: "killed" })),
    true
  );
});

test("active sessions hide execute and show pause for in-progress cards", () => {
  assert.equal(
    canExecuteTaskFromCard(task({ status: "todo", prompt: "Run it" }), session({ status: "running" })),
    false
  );
  assert.equal(
    canPauseTaskFromCard(task({ status: "in_progress" }), session({ status: "running" })),
    true
  );
  assert.equal(
    canPauseTaskFromCard(task({ status: "in_progress" }), session({ status: "paused" })),
    false
  );
});
