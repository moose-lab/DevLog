import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDevLogStats } from "../devlog-dashboard";

test("normalizeDevLogStats maps aggregate API stats to dashboard stats", () => {
  const stats = normalizeDevLogStats({
    totalSessions: 12,
    totalCostUSD: 3.45,
    totalToolCalls: 67,
    allFilesReferenced: ["/a.ts", "/b.ts"],
  });

  assert.deepEqual(stats, {
    sessions: 12,
    totalCost: 3.45,
    toolCalls: 67,
    filesTouched: 2,
  });
});

test("normalizeDevLogStats keeps legacy dashboard stats shape", () => {
  const stats = normalizeDevLogStats({
    sessions: 4,
    totalCost: 1.25,
    toolCalls: 9,
    filesTouched: 3,
  });

  assert.deepEqual(stats, {
    sessions: 4,
    totalCost: 1.25,
    toolCalls: 9,
    filesTouched: 3,
  });
});

test("normalizeDevLogStats returns null for non-object payloads", () => {
  assert.equal(normalizeDevLogStats(null), null);
});
