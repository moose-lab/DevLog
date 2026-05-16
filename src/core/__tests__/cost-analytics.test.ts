import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCredits,
  formatTokenCount,
  formatUsd,
  getTopCostProjects,
  providerLabel,
  quotaWindowLabel,
  type CostPeriodKey,
} from "../cost-analytics";
import type { CostPeriodTotals, CostReport } from "../cost-tracker";

test("formatters keep cost and usage values compact", () => {
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(0.1234), "$0.123");
  assert.equal(formatUsd(12.3), "$12.30");
  assert.equal(formatCredits(12.345), "12.3");
  assert.equal(formatTokenCount(1_250), "1.3K");
  assert.equal(formatTokenCount(12_500_000), "13M");
});

test("labels expose provider and quota window names", () => {
  assert.equal(providerLabel("claude_code"), "Claude Code");
  assert.equal(providerLabel("codex"), "Codex");
  assert.equal(quotaWindowLabel(300), "5h window");
  assert.equal(quotaWindowLabel(10080), "Weekly window");
});

test("getTopCostProjects sorts by selected period totals", () => {
  const report = fakeReport([
    project("low-api", "today", { apiCostUSD: 1, totalTokens: 100 }),
    project("high-api", "today", { apiCostUSD: 4, totalTokens: 50 }),
    project("credits", "today", { apiCostUSD: 0, subscriptionCredits: 40, totalTokens: 500 }),
  ]);

  assert.deepEqual(
    getTopCostProjects(report, "today", 2).map((item) => item.projectName),
    ["high-api", "low-api"]
  );
});

function fakeReport(projects: CostReport["projects"]): CostReport {
  const empty = totals();
  return {
    generatedAt: "2026-05-16T00:00:00.000Z",
    totals: { today: empty, week: empty, allTime: empty },
    providers: [],
    projects,
    quota: [],
    sources: { claudeProjectsDir: "/tmp/claude", codexSessionsDir: "/tmp/codex" },
  };
}

function project(name: string, period: CostPeriodKey, overrides: Partial<CostPeriodTotals>): CostReport["projects"][number] {
  return {
    projectName: name,
    projectPath: `/tmp/${name}`,
    providers: ["codex"],
    today: period === "today" ? totals(overrides) : totals(),
    week: period === "week" ? totals(overrides) : totals(),
    allTime: period === "allTime" ? totals(overrides) : totals(),
  };
}

function totals(overrides: Partial<CostPeriodTotals> = {}): CostPeriodTotals {
  return {
    usageEvents: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    apiCostUSD: 0,
    subscriptionCredits: 0,
    ...overrides,
  };
}
