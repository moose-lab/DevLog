import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportRange, type ReportSession, type ReportTask } from "../report-summary";
import { buildHumanReportEvidence } from "../report-evidence";

test("buildHumanReportEvidence promotes completed tasks into outcome evidence", () => {
  const range = buildReportRange("daily", "2026-05-28");
  assert.ok(range);

  const evidence = buildHumanReportEvidence({
    range,
    tasks: [
      task({
        id: "done-1",
        title: "Publish weekly report HTML",
        status: "done",
        updated_at: "2026-05-28 09:00:00",
        completed_at: "2026-05-28 10:00:00",
      }),
      task({
        id: "old-done",
        title: "Old finished task",
        status: "done",
        updated_at: "2026-05-27 09:00:00",
        completed_at: "2026-05-27 10:00:00",
      }),
    ],
    sessions: [],
  });

  assert.deepEqual(
    evidence.outcomes.map((item) => item.title),
    ["Publish weekly report HTML"],
  );
  assert.equal(evidence.appendix.tasks.length, 1);
});

test("buildHumanReportEvidence keeps only period-touched open tasks as progress evidence", () => {
  const range = buildReportRange("daily", "2026-05-28");
  assert.ok(range);

  const evidence = buildHumanReportEvidence({
    range,
    tasks: [
      task({
        id: "review-1",
        title: "Review report copy",
        status: "review",
        updated_at: "2026-05-28 11:00:00",
      }),
      task({
        id: "running-1",
        title: "Wire report evidence cleaner",
        status: "in_progress",
        updated_at: "2026-05-28 12:00:00",
      }),
      task({
        id: "old-todo",
        title: "Untouched backlog task",
        status: "todo",
        updated_at: "2026-05-27 12:00:00",
      }),
    ],
    sessions: [],
  });

  assert.deepEqual(
    evidence.progress.map((item) => item.title),
    ["Review report copy", "Wire report evidence cleaner"],
  );
});

test("buildHumanReportEvidence turns blocked work and failed sessions into risks while keeping prompts in the appendix", () => {
  const range = buildReportRange("daily", "2026-05-28");
  assert.ok(range);

  const evidence = buildHumanReportEvidence({
    range,
    tasks: [
      task({
        id: "blocked-1",
        title: "Decide snapshot directory",
        status: "blocked",
        updated_at: "2026-05-28 13:00:00",
        fail_reason: "Needs storage decision",
      }),
    ],
    sessions: [
      session({
        id: "sess-failed",
        status: "failed",
        prompt: "Try exporting <script>alert(1)</script> as raw JSON.",
        started_at: "2026-05-28 14:00:00",
        ended_at: "2026-05-28 14:45:00",
      }),
    ],
  });

  assert.deepEqual(
    evidence.risks.map((item) => item.title),
    ["Decide snapshot directory", "Failed session sess-failed"],
  );
  assert.equal(evidence.risks[0]?.reason, "Needs storage decision");
  assert.equal(evidence.risks[1]?.reason, "Session failed after 45m.");
  assert.equal(
    evidence.appendix.sessions[0]?.promptPreview,
    "Try exporting <script>alert(1)</script> as raw JSON.",
  );
  assert.equal(evidence.appendix.sessions[0]?.runtimeMinutes, 45);
});

function task(overrides: Partial<ReportTask>): ReportTask {
  return {
    id: "task",
    project_id: "devlog",
    title: "Task",
    description: null,
    status: "todo",
    priority: "medium",
    worktree_name: null,
    session_id: null,
    sort_order: 0,
    prompt: null,
    blocked_by: null,
    sandbox_iterations: 0,
    fail_reason: null,
    created_at: "2026-05-28 08:00:00",
    updated_at: "2026-05-28 08:00:00",
    completed_at: null,
    ...overrides,
  };
}

function session(overrides: Partial<ReportSession>): ReportSession {
  return {
    id: "session",
    project_id: "devlog",
    task_id: null,
    worktree_name: null,
    worktree_path: null,
    branch_name: null,
    pid: null,
    status: "running",
    claude_command: null,
    claude_session_id: null,
    coding_agent_id: "codex",
    agent_team_id: "default",
    session_auth_mode: "backend-oauth",
    agent_api_key_env_var: null,
    agent_model: "claude-sonnet-4-6",
    prompt: null,
    exit_code: null,
    log_path: null,
    started_at: "2026-05-28 08:00:00",
    ended_at: null,
    ...overrides,
  };
}
