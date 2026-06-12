import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadClaudeSettings,
  upsertDevlogStatusHooks,
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

/**
 * Regression tests for IM-17 (REVIEW-2026-06-10): hooks were written in a
 * flat {type,command} shape, but Claude Code expects matcher-wrapped
 * entries ([{matcher, hooks:[{type,command}]}]) — the status indicator
 * never updated because the hooks never ran.
 */

test("status hooks are written in the matcher-wrapped schema (IM-17)", () => {
  const settings: Record<string, unknown> = {};
  upsertDevlogStatusHooks(settings);

  const hooks = settings.hooks as Record<string, Array<Record<string, unknown>>>;
  for (const event of ["PreToolUse", "PostToolUse", "Stop"]) {
    const entries = hooks[event];
    assert.equal(entries.length, 1, event);
    const [entry] = entries;
    assert.ok(Array.isArray(entry.hooks), `${event} entry must wrap hooks[]`);
    const inner = (entry.hooks as Array<Record<string, unknown>>)[0];
    assert.equal(inner.type, "command");
    assert.match(String(inner.command), /\.claude-status/);
    assert.equal(!("command" in entry), true, `${event} entry must not be flat`);
  }
  // Tool-scoped events carry a match-all matcher; Stop has none.
  assert.equal((hooks.PreToolUse[0] as { matcher?: string }).matcher, "*");
  assert.equal("matcher" in hooks.Stop[0], false);
});

test("re-running migrates flat legacy devlog hooks and keeps user entries", () => {
  const settings: Record<string, unknown> = {
    hooks: {
      PreToolUse: [
        // legacy flat devlog entry (broken shape) — must be replaced
        { type: "command", command: "bash -c 'echo running > ~/.claude-status'" },
        // user's own matcher-wrapped entry — must survive untouched
        { matcher: "Bash", hooks: [{ type: "command", command: "echo user-hook" }] },
      ],
      Stop: [
        // nested devlog entry from a previous run — must not duplicate
        { hooks: [{ type: "command", command: "bash -c 'echo idle > ~/.claude-status'" }] },
      ],
    },
  };
  upsertDevlogStatusHooks(settings);

  const hooks = settings.hooks as Record<string, Array<Record<string, unknown>>>;
  assert.equal(hooks.PreToolUse.length, 2);
  const userEntry = hooks.PreToolUse.find((e) => e.matcher === "Bash");
  assert.ok(userEntry, "user hook entry must be preserved");
  const devlogEntries = hooks.PreToolUse.filter((e) =>
    JSON.stringify(e).includes(".claude-status")
  );
  assert.equal(devlogEntries.length, 1);
  assert.ok(Array.isArray(devlogEntries[0].hooks));
  assert.equal(hooks.Stop.length, 1);
});
