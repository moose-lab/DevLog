import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb, insertSession, insertTask } from "./test-helpers";
import { createLockManager } from "../lock-manager";

test("acquire returns ok on free file", () => {
  const db = makeTestDb();
  const taskId = insertTask(db, { worktree_name: "wt-a" });
  const sessionId = insertSession(db, { task_id: taskId, worktree_name: "wt-a" });
  const lm = createLockManager(db);

  const result = lm.acquire({ sessionId, worktreeName: "wt-a", projectId: "test", paths: ["src/foo.ts"] });

  assert.deepEqual(result, { ok: true, acquired: ["src/foo.ts"] });
  const row = db.prepare("SELECT file_path, session_id, resolved_at FROM file_locks WHERE session_id = ?").get(sessionId);
  assert.deepEqual(row, { file_path: "src/foo.ts", session_id: sessionId, resolved_at: null });
});

test("acquire returns conflict info when file already locked", () => {
  const db = makeTestDb();
  const t1 = insertTask(db, { worktree_name: "wt-a" });
  const s1 = insertSession(db, { task_id: t1, worktree_name: "wt-a" });
  const t2 = insertTask(db, { worktree_name: "wt-b" });
  const s2 = insertSession(db, { task_id: t2, worktree_name: "wt-b" });
  const lm = createLockManager(db);

  lm.acquire({ sessionId: s1, worktreeName: "wt-a", projectId: "test", paths: ["src/shared.ts"] });
  const result = lm.acquire({ sessionId: s2, worktreeName: "wt-b", projectId: "test", paths: ["src/shared.ts", "src/other.ts"] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.conflictingPaths, ["src/shared.ts"]);
  assert.deepEqual(result.conflictingSessionIds, [s1]);
  // Important: NO partial acquire — src/other.ts should NOT be locked by s2
  assert.equal(lm.whoHolds("src/other.ts"), null);
});

test("acquire succeeds when same session re-acquires its own lock", () => {
  const db = makeTestDb();
  const t = insertTask(db);
  const s = insertSession(db, { task_id: t, worktree_name: "wt" });
  const lm = createLockManager(db);

  lm.acquire({ sessionId: s, worktreeName: "wt", projectId: "test", paths: ["a.ts"] });
  const result = lm.acquire({ sessionId: s, worktreeName: "wt", projectId: "test", paths: ["a.ts"] });

  assert.equal(result.ok, true);
  // Duplicates ARE inserted (no UNIQUE constraint); v1 accepts them as harmless. Test only verifies the API returns ok.
});
