import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildReportSummary, type ReportTask } from "../report-summary";
import {
  getReportSnapshotFileName,
  persistReportSnapshot,
} from "../report-summary-store";

test("persistReportSnapshot writes backend JSON under a period/range/project filename", async () => {
  const reportsDir = await mkdtemp(join(tmpdir(), "devlog-report-snapshot-"));
  try {
    const summary = buildReportSummary({
      date: "2026-05-28",
      period: "daily",
      projectId: "dev/log",
      projectName: "DevLog",
      tasks: [
        task({
          id: "done-1",
          title: "Publish human report",
          status: "done",
          updated_at: "2026-05-28 09:00:00",
          completed_at: "2026-05-28 09:30:00",
        }),
      ],
      sessions: [],
      generatedAt: "2026-05-28T09:31:00.000Z",
    });

    const result = persistReportSnapshot(summary, { reportsDir });

    assert.equal(result.ok, true);
    const fileName = getReportSnapshotFileName(summary);
    assert.match(fileName, /^daily-2026-05-28-project-[a-f0-9]{12}\.json$/);
    assert.equal(result.path, join(reportsDir, fileName));

    const json = JSON.parse(await readFile(result.path!, "utf-8"));
    assert.equal(json.projectId, "dev/log");
    assert.equal(json.range.period, "daily");
    assert.equal(json.humanReport.completedOutcomes[0].title, "Publish human report");
  } finally {
    await rm(reportsDir, { recursive: true, force: true });
  }
});

test("getReportSnapshotFileName keeps raw project ids out of the path", () => {
  const summary = buildReportSummary({
    date: "2026-05-28",
    period: "daily",
    projectId: "../dev/log",
    projectName: "DevLog",
    tasks: [],
    sessions: [],
    generatedAt: "2026-05-28T09:31:00.000Z",
  });

  const fileName = getReportSnapshotFileName(summary);

  assert.match(fileName, /^daily-2026-05-28-project-[a-f0-9]{12}\.json$/);
  assert.doesNotMatch(fileName, /\.\.|\/|\\/);
});

test("persistReportSnapshot returns a non-fatal failure when snapshot writing fails", () => {
  const summary = buildReportSummary({
    date: "2026-05-28",
    period: "weekly",
    projectId: "devlog",
    projectName: "DevLog",
    tasks: [],
    sessions: [],
    generatedAt: "2026-05-28T09:31:00.000Z",
  });

  const result = persistReportSnapshot(summary, {
    reportsDir: "/not-used",
    mkdirSync() {
      return undefined as never;
    },
    writeFileSync() {
      throw new Error("disk unavailable");
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /disk unavailable/);
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
