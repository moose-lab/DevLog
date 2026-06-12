import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadClaudeSettings,
  writeClaudeSettingsWithBackup,
} from "../../cli/lib/claude-settings";

/**
 * Regression tests for IM-18 (REVIEW-2026-06-10): a corrupt
 * ~/.claude/settings.json was parsed to `{}` and silently overwritten with
 * a devlog-only object — destroying the user's hooks, model config, etc.
 */

function tempPath(): { dir: string; path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "devlog-settings-"));
  return {
    dir,
    path: join(dir, "settings.json"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("corrupt settings files abort instead of resolving to {} (IM-18)", () => {
  const { path, cleanup } = tempPath();
  try {
    writeFileSync(path, "{ definitely not json");
    const result = loadClaudeSettings(path);
    assert.equal(result.ok, false);
  } finally {
    cleanup();
  }
});

test("missing files load as empty settings; valid files round-trip", () => {
  const { path, cleanup } = tempPath();
  try {
    const missing = loadClaudeSettings(path);
    assert.deepEqual(missing, { ok: true, settings: {} });

    writeFileSync(path, JSON.stringify({ model: "opus" }));
    const loaded = loadClaudeSettings(path);
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.equal(loaded.settings.model, "opus");
  } finally {
    cleanup();
  }
});

test("writes keep a .bak of the previous content (IM-18)", () => {
  const { path, cleanup } = tempPath();
  try {
    writeFileSync(path, JSON.stringify({ precious: true }));
    writeClaudeSettingsWithBackup(path, { precious: true, statusLine: {} });

    const backup = JSON.parse(readFileSync(`${path}.bak`, "utf-8"));
    assert.deepEqual(backup, { precious: true });
    const current = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(current.precious, true);
    assert.ok("statusLine" in current);
  } finally {
    cleanup();
  }
});
