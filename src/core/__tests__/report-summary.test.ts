import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReportSummary,
  buildReportRange,
  normalizeReportDate,
  renderReportHtml,
  type ReportSession,
  type ReportTask,
} from "../report-summary";

test("normalizeReportDate accepts only real YYYY-MM-DD dates", () => {
  assert.equal(normalizeReportDate("2026-05-27"), "2026-05-27");
  assert.equal(normalizeReportDate("2026-02-31"), null);
  assert.equal(normalizeReportDate("05/27/2026"), null);
});

test("buildReportSummary groups daily task progress and session activity", () => {
  const tasks: ReportTask[] = [
    task({
      id: "done-1",
      title: "Implement daily export route",
      status: "done",
      updated_at: "2026-05-27 10:00:00",
      completed_at: "2026-05-27 10:30:00",
    }),
    task({
      id: "review-1",
      title: "Review summary copy",
      status: "review",
      updated_at: "2026-05-27 11:00:00",
    }),
    task({
      id: "blocked-1",
      title: "Wire production storage",
      status: "blocked",
      updated_at: "2026-05-27 12:00:00",
      fail_reason: "Needs storage decision",
    }),
    task({
      id: "old-1",
      title: "Yesterday work",
      status: "done",
      updated_at: "2026-05-26 09:00:00",
      completed_at: "2026-05-26 09:30:00",
    }),
  ];
  const sessions: ReportSession[] = [
    session({
      id: "sess-1",
      task_id: "done-1",
      status: "completed",
      prompt: "Create the HTML daily summary export.",
      started_at: "2026-05-27 09:00:00",
      ended_at: "2026-05-27 10:00:00",
    }),
    session({
      id: "sess-2",
      task_id: "review-1",
      status: "running",
      prompt: "Polish the report wording.",
      started_at: "2026-05-27 11:30:00",
      ended_at: null,
    }),
    session({
      id: "sess-old",
      task_id: "old-1",
      status: "completed",
      prompt: "Old work",
      started_at: "2026-05-26 09:00:00",
      ended_at: "2026-05-26 10:00:00",
    }),
  ];

  const summary = buildReportSummary({
    date: "2026-05-27",
    projectId: "devlog",
    projectName: "DevLog",
    tasks,
    sessions,
  });

  assert.equal(summary.metrics.touchedTasks, 3);
  assert.equal(summary.metrics.completedInPeriod, 1);
  assert.equal(summary.metrics.completionRate, 33);
  assert.equal(summary.metrics.projectProgressRate, 50);
  assert.equal(summary.metrics.sessions, 2);
  assert.equal(summary.metrics.completedSessions, 1);
  assert.equal(summary.metrics.runtimeMinutes, 60);
  assert.deepEqual(
    summary.sections.completed.map((item) => item.title),
    ["Implement daily export route"],
  );
  assert.deepEqual(
    summary.sections.review.map((item) => item.title),
    ["Review summary copy"],
  );
  assert.deepEqual(
    summary.sections.blocked.map((item) => item.title),
    ["Wire production storage"],
  );
  assert.equal(summary.humanReport.status.value, "blocked");
  assert.match(summary.humanReport.status.reason, /1 risk\/blocker/);
  assert.match(summary.humanReport.executiveSummary, /Daily Report for DevLog/);
  assert.deepEqual(
    summary.humanReport.completedOutcomes.map((item) => item.title),
    ["Implement daily export route"],
  );
  assert.deepEqual(
    summary.humanReport.inProgress.map((item) => item.title),
    ["Review summary copy"],
  );
  assert.deepEqual(
    summary.humanReport.risksAndBlockers.map((item) => item.title),
    ["Wire production storage"],
  );
  assert.deepEqual(
    summary.humanReport.nextPriorities.map((item) => item.title),
    ["Resolve: Wire production storage", "Continue: Review summary copy"],
  );
  assert.match(
    summary.highlights[0],
    /Completed 1 task and moved 1 task into review/,
  );
});

test("buildReportSummary supports weekly and monthly report windows", () => {
  const tasks: ReportTask[] = [
    task({
      id: "monday",
      title: "Monday backend work",
      status: "done",
      updated_at: "2026-05-25 10:00:00",
      completed_at: "2026-05-25 11:00:00",
    }),
    task({
      id: "sunday",
      title: "Sunday release check",
      status: "review",
      updated_at: "2026-05-31 16:00:00",
    }),
    task({
      id: "month-only",
      title: "Earlier monthly planning",
      status: "done",
      updated_at: "2026-05-03 12:00:00",
      completed_at: "2026-05-03 13:00:00",
    }),
    task({
      id: "outside",
      title: "June follow-up",
      status: "done",
      updated_at: "2026-06-01 09:00:00",
      completed_at: "2026-06-01 10:00:00",
    }),
  ];

  const weekly = buildReportSummary({
    date: "2026-05-27",
    period: "weekly",
    projectId: "devlog",
    projectName: "DevLog",
    tasks,
    sessions: [],
  });
  const monthly = buildReportSummary({
    date: "2026-05-27",
    period: "monthly",
    projectId: "devlog",
    projectName: "DevLog",
    tasks,
    sessions: [],
  });

  assert.deepEqual(weekly.range, {
    period: "weekly",
    startDate: "2026-05-25",
    endDate: "2026-05-31",
    label: "Weekly Report",
  });
  assert.deepEqual(
    weekly.sections.completed.map((item) => item.title),
    ["Monday backend work"],
  );
  assert.deepEqual(
    weekly.sections.review.map((item) => item.title),
    ["Sunday release check"],
  );
  assert.deepEqual(
    weekly.humanReport.completedOutcomes.map((item) => item.title),
    ["Monday backend work"],
  );
  assert.deepEqual(
    weekly.humanReport.inProgress.map((item) => item.title),
    ["Sunday release check"],
  );
  assert.equal(monthly.range.startDate, "2026-05-01");
  assert.equal(monthly.range.endDate, "2026-05-31");
  assert.equal(monthly.metrics.completedInPeriod, 2);
});

test("buildReportSummary creates a useful no-activity human report for empty periods", () => {
  const summary = buildReportSummary({
    date: "2026-05-28",
    projectId: "devlog",
    projectName: "DevLog",
    tasks: [],
    sessions: [],
  });

  assert.equal(summary.humanReport.status.value, "no_activity");
  assert.match(summary.humanReport.executiveSummary, /No DevLog work was recorded/);
  assert.deepEqual(summary.humanReport.completedOutcomes, []);
  assert.deepEqual(summary.humanReport.inProgress, []);
  assert.deepEqual(summary.humanReport.risksAndBlockers, []);
  assert.deepEqual(summary.humanReport.nextPriorities, []);
});

test("buildReportRange validates report period names", () => {
  assert.deepEqual(buildReportRange("daily", "2026-05-27"), {
    period: "daily",
    startDate: "2026-05-27",
    endDate: "2026-05-27",
    label: "Daily Report",
  });
  assert.equal(buildReportRange("quarterly", "2026-05-27"), null);
});

test("buildReportSummary resolves project names from a Map for dangerous project ids", () => {
  const summary = buildReportSummary({
    date: "2026-05-27",
    projectId: "__proto__",
    projectName: "Prototype Project",
    projectNames: new Map([
      ["__proto__", "Prototype Project"],
    ]),
    tasks: [
      task({
        id: "dangerous-project",
        project_id: "__proto__",
        title: "Handle dynamic project ids safely",
        status: "done",
        updated_at: "2026-05-27 10:00:00",
        completed_at: "2026-05-27 11:00:00",
      }),
    ],
    sessions: [],
  });

  assert.equal(summary.projectBreakdown[0]?.projectName, "Prototype Project");
});

test("renderReportHtml escapes content and renders clear report sections", () => {
  const summary = buildReportSummary({
    date: "2026-05-27",
    projectId: "devlog",
    projectName: "DevLog",
    tasks: [
      task({
        id: "done-1",
        title: "Ship <daily> summary",
        description: "Export HTML for developers",
        status: "done",
        updated_at: "2026-05-27 10:00:00",
        completed_at: "2026-05-27 10:30:00",
      }),
      task({
        id: "active-1",
        title: "Polish report body",
        description: "Move metrics into the appendix",
        status: "in_progress",
        updated_at: "2026-05-27 11:00:00",
      }),
      task({
        id: "blocked-1",
        title: "Store report snapshots",
        status: "blocked",
        updated_at: "2026-05-27 12:00:00",
        fail_reason: "Needs <storage> decision",
      }),
    ],
    sessions: [
      session({
        id: "sess-1",
        task_id: "done-1",
        status: "completed",
        prompt: "Create <script>alert(1)</script>",
        started_at: "2026-05-27 09:00:00",
        ended_at: "2026-05-27 10:00:00",
      }),
    ],
  });

  const html = renderReportHtml(summary);

  assert.match(html, /<!doctype html>/);
  assert.match(html, /Daily Report/);
  assert.match(html, /DevLog/);
  assert.match(html, /Ship &lt;daily&gt; summary/);
  assert.match(html, /Executive Summary/);
  assert.match(html, /Completed Outcomes/);
  assert.match(html, /In Progress/);
  assert.match(html, /Risks And Blockers/);
  assert.match(html, /Next Priorities/);
  assert.match(html, /Evidence Appendix/);
  assert.match(html, /Snapshot/);
  assert.match(html, /Needs &lt;storage&gt; decision/);
  assert.ok(html.indexOf("Executive Summary") < html.indexOf("Evidence Appendix"));
  assert.ok(html.indexOf("Completed Outcomes") < html.indexOf("Snapshot"));
  assert.doesNotMatch(html, /<script>alert/);
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
    created_at: "2026-05-27 08:00:00",
    updated_at: "2026-05-27 08:00:00",
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
    coding_agent_id: "solo-coding-agent",
    agent_team_id: "backend-coding-agent",
    session_auth_mode: "backend-oauth",
    agent_api_key_env_var: null,
    local_cli_agent_id: "claude",
    agent_model: "claude-sonnet-4-6",
    agent_reasoning: "default",
    agent_api_protocol: "anthropic",
    agent_api_version: "",
    agent_base_url: "https://api.anthropic.com",
    agent_max_tokens: 8192,
    prompt: null,
    exit_code: null,
    log_path: null,
    started_at: "2026-05-27 09:00:00",
    ended_at: null,
    ...overrides,
  };
}
