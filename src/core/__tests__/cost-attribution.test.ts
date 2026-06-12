// Pin the zone: daily attribution buckets by the local calendar day.
process.env.TZ = "Asia/Shanghai";

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanSession } from "../parser";
import { aggregateCostReport, claudeSessionToRecords } from "../cost-tracker";
import type { Session, SessionMeta } from "../types";

/**
 * Regression tests for IM-24 (REVIEW-2026-06-10): a week-long Claude
 * session's entire cost was booked as a single record on its last-activity
 * day with empty token totals — "today's cost" could inflate by orders of
 * magnitude.
 */

function makeJsonl(lines: unknown[]): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "devlog-cost-attr-"));
  const path = join(dir, "session.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function assistantMessage(id: string, timestamp: string, tokens: { in: number; out: number }) {
  return {
    type: "assistant",
    timestamp,
    message: {
      id,
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [{ type: "text", text: "work" }],
      usage: { input_tokens: tokens.in, output_tokens: tokens.out },
    },
  };
}

test("scanSession buckets cost and tokens per local day and model (IM-24)", async () => {
  const { path, cleanup } = makeJsonl([
    assistantMessage("m1", "2026-06-09T10:00:00.000Z", { in: 1000, out: 500 }),
    // 22:30 UTC on the 10th = 06:30 on the 11th in Asia/Shanghai
    assistantMessage("m2", "2026-06-10T22:30:00.000Z", { in: 2000, out: 1000 }),
  ]);
  try {
    const meta = await scanSession(path);
    const daily = meta.dailyUsage ?? [];
    assert.deepEqual(
      daily.map((b) => b.date),
      ["2026-06-09", "2026-06-11"]
    );
    assert.equal(daily[0].inputTokens, 1000);
    assert.equal(daily[0].outputTokens, 500);
    assert.equal(daily[1].inputTokens, 2000);
    // Bucketed costs add up to the session total.
    const sum = daily.reduce((acc, b) => acc + b.costUSD, 0);
    assert.ok(Math.abs(sum - meta.totalCostUSD) < 1e-9);
    assert.ok(meta.totalCostUSD > 0);
  } finally {
    cleanup();
  }
});

function makeSession(meta: Partial<SessionMeta>): Session {
  return {
    id: "s1",
    projectPath: "/p",
    projectName: "proj",
    filePath: "/p/s1.jsonl",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-11T05:00:00.000Z"),
    meta: {
      messageCount: 2,
      humanTurns: 1,
      assistantTurns: 1,
      toolCalls: 0,
      uniqueTools: [],
      filesReferenced: [],
      totalCostUSD: 3,
      totalDurationMs: 0,
      models: ["claude-sonnet-4-6"],
      firstUserMessage: "",
      lastActivity: new Date("2026-06-11T05:00:00.000Z"),
      firstActivity: new Date("2026-06-01T00:00:00.000Z"),
      errorCount: 0,
      costByModel: { "claude-sonnet-4-6": 3 },
      ...meta,
    },
  };
}

test("claude cost lands on the day each message ran, not the session's last day (IM-24)", () => {
  const session = makeSession({
    dailyUsage: [
      {
        date: "2026-06-01",
        model: "claude-sonnet-4-6",
        costUSD: 2,
        lastTimestamp: "2026-06-01T05:00:00.000Z",
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 200,
      },
      {
        date: "2026-06-11",
        model: "claude-sonnet-4-6",
        costUSD: 1,
        lastTimestamp: "2026-06-11T05:00:00.000Z",
        inputTokens: 500,
        cachedInputTokens: 100,
        outputTokens: 50,
      },
    ],
  });

  const records = claudeSessionToRecords(session);
  assert.equal(records.length, 2);
  assert.equal(records[1].tokens.inputTokens, 500);
  assert.equal(records[1].tokens.cachedInputTokens, 100);

  const report = aggregateCostReport(records, [], {
    now: new Date("2026-06-11T12:00:00+08:00"),
    claudeProjectsDir: "/claude",
    codexSessionsDir: "/codex",
  });

  // Only the June 11 bucket is today's cost — previously the whole $3
  // landed on the last-activity day.
  assert.equal(report.totals.today.apiCostUSD, 1);
  assert.equal(report.totals.allTime.apiCostUSD, 3);
});

test("sessions without daily buckets keep the legacy single-record fallback", () => {
  const session = makeSession({ dailyUsage: undefined });
  const records = claudeSessionToRecords(session);
  assert.equal(records.length, 1);
  assert.equal(records[0].apiCostUSD, 3);
  assert.equal(records[0].timestamp.toISOString(), "2026-06-11T05:00:00.000Z");
});
