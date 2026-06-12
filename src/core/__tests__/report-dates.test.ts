// Pin the zone before any Date work — these are the TZ-boundary tests the
// CI TZ=Asia/Shanghai pin existed for (IM-3, REVIEW-2026-06-10).
process.env.TZ = "Asia/Shanghai";

import { test } from "node:test";
import assert from "node:assert/strict";
import { getTodayDateKey, localDateKey, parseDbTimestamp } from "../report-dates";
import { buildReportSummary } from "../report-summary";
import type { Session, Task } from "../types-dashboard";

test("bare SQLite timestamps are parsed as UTC, not local (IM-3)", () => {
  const parsed = parseDbTimestamp("2026-06-10 22:30:00");
  assert.ok(parsed);
  assert.equal(parsed.toISOString(), "2026-06-10T22:30:00.000Z");

  // Explicit zones are respected as-is.
  const zoned = parseDbTimestamp("2026-06-10 22:30:00+08:00");
  assert.ok(zoned);
  assert.equal(zoned.toISOString(), "2026-06-10T14:30:00.000Z");
});

test("day keys bucket by the local calendar day (IM-3)", () => {
  // 22:30 UTC on the 10th is 06:30 on the 11th in Asia/Shanghai — this work
  // previously landed in the previous day's report.
  assert.equal(localDateKey("2026-06-10 22:30:00"), "2026-06-11");
  assert.equal(localDateKey("2026-06-10 10:00:00"), "2026-06-10");
  assert.equal(localDateKey("2026-06-11"), "2026-06-11");
  assert.equal(localDateKey(null), null);
  assert.equal(localDateKey("not a date"), null);

  assert.equal(getTodayDateKey(new Date("2026-06-10T22:30:00.000Z")), "2026-06-11");
});

test("early-morning local work appears in that local day's report (IM-3)", () => {
  // Session ran 04:00–05:00 local on June 11 → stored as June 10 UTC.
  const session = {
    id: "s1",
    project_id: "p1",
    task_id: null,
    worktree_name: null,
    worktree_path: null,
    branch_name: null,
    pid: null,
    status: "completed",
    claude_command: null,
    claude_session_id: null,
    prompt: "early bird work",
    exit_code: 0,
    log_path: null,
    started_at: "2026-06-10 20:00:00",
    ended_at: "2026-06-10 21:00:00",
  } as unknown as Session;

  const base = {
    projectId: "p1",
    projectName: "Project",
    tasks: [] as Task[],
    sessions: [session],
    generatedAt: "2026-06-11T08:00:00.000Z",
  };

  const reportForThe11th = buildReportSummary({ ...base, date: "2026-06-11" });
  assert.equal(reportForThe11th.metrics.sessions, 1);
  assert.equal(reportForThe11th.metrics.runtimeMinutes, 60);

  const reportForThe10th = buildReportSummary({ ...base, date: "2026-06-10" });
  assert.equal(reportForThe10th.metrics.sessions, 0);
});
