import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearDiscoveryCache,
  discoverProjects,
  getDiscoveryCacheStats,
} from "../discovery";

/**
 * Regression tests for IM-23 (REVIEW-2026-06-10): every dashboard poll
 * re-parsed every JSONL under ~/.claude/projects serially — multi-second
 * CPU+IO per request at a few thousand sessions. Scans are now memoized by
 * (path, mtime, size) and only changed files are re-read.
 */

function line(text: string, timestamp: string): string {
  return (
    JSON.stringify({
      type: "assistant",
      timestamp,
      message: { role: "assistant", content: [{ type: "text", text }] },
    }) + "\n"
  );
}

function makeProjectsDir(): { dir: string; file: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "devlog-discovery-"));
  const projectDir = join(dir, "-tmp-proj-a");
  mkdirSync(projectDir);
  const file = join(projectDir, "session-1.jsonl");
  writeFileSync(file, line("hello", "2026-06-01T10:00:00.000Z"));
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("unchanged files are served from the scan cache (IM-23)", async () => {
  const { dir, cleanup } = makeProjectsDir();
  try {
    clearDiscoveryCache();

    const first = await discoverProjects(dir);
    assert.equal(first.length, 1);
    assert.equal(first[0].sessions[0].meta.assistantTurns, 1);
    const afterFirst = getDiscoveryCacheStats();
    assert.equal(afterFirst.misses, 1);
    assert.equal(afterFirst.hits, 0);

    const second = await discoverProjects(dir);
    assert.equal(second[0].sessions[0].meta.assistantTurns, 1);
    const afterSecond = getDiscoveryCacheStats();
    assert.equal(afterSecond.misses, 1);
    assert.equal(afterSecond.hits, 1);
  } finally {
    cleanup();
  }
});

test("changed files are rescanned and fresh metadata returned", async () => {
  const { dir, file, cleanup } = makeProjectsDir();
  try {
    clearDiscoveryCache();
    await discoverProjects(dir);

    appendFileSync(file, line("more work", "2026-06-01T11:00:00.000Z"));

    const after = await discoverProjects(dir);
    assert.equal(after[0].sessions[0].meta.assistantTurns, 2);
    const stats = getDiscoveryCacheStats();
    assert.equal(stats.misses, 2);
  } finally {
    cleanup();
  }
});

test("cache entries for deleted files are pruned", async () => {
  const { dir, file, cleanup } = makeProjectsDir();
  try {
    clearDiscoveryCache();
    await discoverProjects(dir);
    assert.equal(getDiscoveryCacheStats().entries, 1);

    rmSync(file);
    await discoverProjects(dir);
    assert.equal(getDiscoveryCacheStats().entries, 0);
  } finally {
    cleanup();
  }
});
