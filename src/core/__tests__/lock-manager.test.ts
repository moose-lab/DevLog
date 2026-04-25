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
