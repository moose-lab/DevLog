import { test } from "node:test";
import assert from "node:assert/strict";
import { insertSession, makeTestDb } from "./test-helpers";
import {
  detectAndMarkConflicts,
  recordWorktreeFileLock,
  resolveFileLock,
} from "../file-watcher";

/**
 * Regression tests for the lock-ownership cleanup (REVIEW-2026-06-10
 * suggestions): file-watcher inserted file_locks without project_id, so
 * every row defaulted to 'videoclaw' and the project-scoped conflict
 * queries returned empty for every other project.
 */

test("locks are recorded under the worktree's project (latent project_id bug)", () => {
  const db = makeTestDb();
  const sessionId = insertSession(db, { project_id: "proj-a" });
  recordWorktreeFileLock(db, {
    projectId: "proj-a",
    filePath: "src/index.ts",
    worktreeName: "wt-1",
    sessionId,
  });

  const row = db
    .prepare("SELECT project_id, lock_type FROM file_locks WHERE file_path = 'src/index.ts'")
    .get() as { project_id: string; lock_type: string };
  assert.equal(row.project_id, "proj-a");
  assert.equal(row.lock_type, "write");
});

test("conflicts are detected within a project and ignore other projects", () => {
  const db = makeTestDb();
  recordWorktreeFileLock(db, {
    projectId: "proj-a",
    filePath: "shared.ts",
    worktreeName: "wt-1",
    sessionId: null,
  });
  // Same file touched in a different project must NOT conflict.
  recordWorktreeFileLock(db, {
    projectId: "proj-b",
    filePath: "shared.ts",
    worktreeName: "wt-other",
    sessionId: null,
  });
  assert.deepEqual(
    detectAndMarkConflicts(db, { projectId: "proj-b", filePath: "shared.ts", worktreeName: "wt-other" }),
    ["wt-1"].filter(() => false)
  );

  // A second worktree in the SAME project does conflict.
  recordWorktreeFileLock(db, {
    projectId: "proj-a",
    filePath: "shared.ts",
    worktreeName: "wt-2",
    sessionId: null,
  });
  const conflicts = detectAndMarkConflicts(db, {
    projectId: "proj-a",
    filePath: "shared.ts",
    worktreeName: "wt-2",
  });
  assert.deepEqual(conflicts, ["wt-1"]);

  const marked = db
    .prepare("SELECT project_id FROM file_locks WHERE lock_type = 'conflict'")
    .all() as { project_id: string }[];
  assert.ok(marked.length > 0);
  assert.ok(marked.every((m) => m.project_id === "proj-a"), "other projects' locks stay untouched");
});

test("resolving a lock is scoped to the project", () => {
  const db = makeTestDb();
  for (const projectId of ["proj-a", "proj-b"]) {
    recordWorktreeFileLock(db, {
      projectId,
      filePath: "same.ts",
      worktreeName: `wt-${projectId}`,
      sessionId: null,
    });
  }
  resolveFileLock(db, { projectId: "proj-a", filePath: "same.ts" });

  const open = db
    .prepare("SELECT project_id FROM file_locks WHERE resolved_at IS NULL")
    .all() as { project_id: string }[];
  assert.deepEqual(open.map((o) => o.project_id), ["proj-b"]);
});
