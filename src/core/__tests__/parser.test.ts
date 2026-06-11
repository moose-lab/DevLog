import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanSession } from "../parser";

/**
 * Regression tests for the scanSession/parseSessionFile findings of
 * REVIEW-2026-06-10 (IM-1/2/4) — the parser feeds every duration, cost, and
 * date stat the product reports.
 */

function makeJsonl(lines: unknown[]): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "devlog-parser-"));
  const path = join(dir, "session.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("turn durations are counted exactly once (IM-1)", async () => {
  const { path, cleanup } = makeJsonl([
    {
      type: "system",
      subtype: "turn_duration",
      durationMs: 5000,
      timestamp: "2026-06-01T10:00:00.000Z",
    },
    {
      type: "assistant",
      durationMs: 1200,
      timestamp: "2026-06-01T10:00:05.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "done" }] },
    },
  ]);
  try {
    const meta = await scanSession(path);
    // 5000 + 1200 — the turn_duration event previously counted double.
    assert.equal(meta.totalDurationMs, 6200);
  } finally {
    cleanup();
  }
});
