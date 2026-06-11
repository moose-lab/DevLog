import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionFile, scanSession } from "../parser";

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

test("sessions without timestamps report epoch so callers can fall back (IM-4)", async () => {
  const { path, cleanup } = makeJsonl([
    { type: "assistant", content: "no timestamp here" },
  ]);
  try {
    const meta = await scanSession(path);
    // firstActivity was initialized to new Date() (scan time), so the
    // birthtime fallback in discovery (getTime() > 0) never ran and the
    // session's creation date changed on every scan.
    assert.equal(meta.firstActivity.getTime(), 0);
    assert.equal(meta.lastActivity.getTime(), 0);
  } finally {
    cleanup();
  }
});

test("firstActivity tracks the earliest timestamp seen", async () => {
  const { path, cleanup } = makeJsonl([
    { type: "assistant", content: "b", timestamp: "2026-06-02T10:00:00.000Z" },
    { type: "user", content: "a", timestamp: "2026-06-01T09:00:00.000Z" },
  ]);
  try {
    const meta = await scanSession(path);
    assert.equal(meta.firstActivity.toISOString(), "2026-06-01T09:00:00.000Z");
    assert.equal(meta.lastActivity.toISOString(), "2026-06-02T10:00:00.000Z");
  } finally {
    cleanup();
  }
});

test("legacy string-content messages produce events for both roles (IM-2)", async () => {
  const { path, cleanup } = makeJsonl([
    // Legacy format: top-level string content
    {
      type: "assistant",
      content: "plain legacy assistant text",
      timestamp: "2026-06-01T10:00:00.000Z",
    },
    // Real format with string (non-array) message content
    {
      type: "assistant",
      message: { role: "assistant", content: "string message content" },
      timestamp: "2026-06-01T10:00:01.000Z",
    },
    {
      type: "user",
      content: "legacy human text",
      timestamp: "2026-06-01T10:00:02.000Z",
    },
  ]);
  try {
    const events = await parseSessionFile(path, "s1");
    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map((e) => [e.role, e.content]),
      [
        ["assistant", "plain legacy assistant text"],
        ["assistant", "string message content"],
        ["human", "legacy human text"],
      ]
    );
  } finally {
    cleanup();
  }
});

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
