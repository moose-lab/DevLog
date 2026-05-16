import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCostReport,
  computeCodexApiCostUSD,
  computeCodexSubscriptionCredits,
  scanCodexSession,
  type CostTokenTotals,
} from "../cost-tracker";

const TOKENS: CostTokenTotals = {
  inputTokens: 1_000_000,
  cachedInputTokens: 1_000_000,
  outputTokens: 1_000_000,
  reasoningOutputTokens: 0,
  totalTokens: 3_000_000,
};

async function withCodexJsonl(lines: unknown[], run: (filePath: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "devlog-codex-cost-"));
  const filePath = join(dir, "rollout-test.jsonl");
  await writeFile(filePath, lines.map((line) => JSON.stringify(line)).join("\n"), "utf-8");

  try {
    await run(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("computeCodexApiCostUSD prices input, cached input, and output tokens", () => {
  assert.equal(computeCodexApiCostUSD("gpt-5.1-codex", TOKENS), 11.375);
});

test("computeCodexSubscriptionCredits uses the Codex token-based rate card", () => {
  assert.equal(computeCodexSubscriptionCredits("gpt-5.3-codex", TOKENS), 398.125);
});

test("scanCodexSession emits token deltas and skips duplicate total snapshots", async () => {
  await withCodexJsonl(
    [
      {
        timestamp: "2026-05-16T01:00:00.000Z",
        type: "turn_context",
        payload: { cwd: "/Users/moose/Moose/DevLog", model: "gpt-5.1-codex" },
      },
      tokenCount("2026-05-16T01:01:00.000Z", 1000, 200, 50, 10, 1250, 12, 40),
      tokenCount("2026-05-16T01:02:00.000Z", 1000, 200, 50, 10, 1250, 12, 40),
      tokenCount("2026-05-16T01:03:00.000Z", 1600, 400, 100, 20, 2100, 14, 42),
    ],
    async (filePath) => {
      const result = await scanCodexSession(filePath);

      assert.equal(result.records.length, 2);
      assert.equal(result.records[0].tokens.inputTokens, 1000);
      assert.equal(result.records[1].tokens.inputTokens, 600);
      assert.equal(result.records[1].tokens.cachedInputTokens, 200);
      assert.equal(result.records[1].projectName, "DevLog");
      assert.equal(result.quota.at(-1)?.remainingPercent, 58);
    }
  );
});

test("aggregateCostReport groups Codex usage by project and period", async () => {
  await withCodexJsonl(
    [
      {
        timestamp: "2026-05-16T01:00:00.000Z",
        type: "turn_context",
        payload: { cwd: "/Users/moose/Moose/DevLog", model: "gpt-5.1-codex" },
      },
      tokenCount("2026-05-16T01:01:00.000Z", 1000, 200, 50, 10, 1250, 2, 8),
      {
        timestamp: "2026-05-16T02:00:00.000Z",
        type: "turn_context",
        payload: { cwd: "/Users/moose/Moose/QuickFork", model: "gpt-5.1-codex" },
      },
      tokenCount("2026-05-16T02:01:00.000Z", 3000, 400, 100, 20, 3500, 3, 9),
    ],
    async (filePath) => {
      const parsed = await scanCodexSession(filePath);
      const report = aggregateCostReport(parsed.records, parsed.quota, {
        now: new Date("2026-05-16T12:00:00.000Z"),
        claudeProjectsDir: "/tmp/claude",
        codexSessionsDir: "/tmp/codex",
      });

      assert.equal(report.totals.today.usageEvents, 2);
      assert.equal(report.projects.length, 2);
      assert.equal(report.projects.find((p) => p.projectName === "QuickFork")?.today.inputTokens, 2000);
      assert.equal(report.quota.find((q) => q.name === "secondary")?.remainingPercent, 91);
    }
  );
});

test("aggregateCostReport uses a calendar-month window for monthly totals", async () => {
  await withCodexJsonl(
    [
      {
        timestamp: "2026-04-15T23:59:00.000+08:00",
        type: "turn_context",
        payload: { cwd: "/Users/moose/Moose/DevLog", model: "gpt-5.1-codex" },
      },
      tokenCount("2026-04-15T23:59:00.000+08:00", 500, 0, 0, 0, 500, 2, 8),
      tokenCount("2026-04-16T00:00:00.000+08:00", 1000, 0, 0, 0, 1000, 3, 9),
      tokenCount("2026-05-16T01:00:00.000+08:00", 1500, 0, 0, 0, 1500, 4, 10),
    ],
    async (filePath) => {
      const parsed = await scanCodexSession(filePath);
      const report = aggregateCostReport(parsed.records, parsed.quota, {
        now: new Date("2026-05-16T12:00:00.000+08:00"),
        claudeProjectsDir: "/tmp/claude",
        codexSessionsDir: "/tmp/codex",
      });

      assert.equal(report.totals.month.usageEvents, 2);
      assert.equal(report.totals.month.inputTokens, 1000);
      assert.equal(report.totals.week.usageEvents, 1);
      assert.equal(report.totals.today.usageEvents, 1);
      assert.equal(report.projects.find((p) => p.projectName === "DevLog")?.month.inputTokens, 1000);
    }
  );
});

function tokenCount(
  timestamp: string,
  input: number,
  cached: number,
  output: number,
  reasoning: number,
  total: number,
  primaryUsed: number,
  secondaryUsed: number
) {
  return {
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
          reasoning_output_tokens: reasoning,
          total_tokens: total,
        },
      },
      rate_limits: {
        primary: { used_percent: primaryUsed, window_minutes: 300, resets_at: 1778911200 },
        secondary: { used_percent: secondaryUsed, window_minutes: 10080, resets_at: 1779516000 },
      },
    },
  };
}
