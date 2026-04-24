import Database from "better-sqlite3";
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb, insertTask } from "./test-helpers";
import { migrateTasksV2 } from "../db";

test("tasks.status accepts new in_queue and fail values", () => {
  const db = makeTestDb();
  const a = insertTask(db, { status: "in_queue" });
  const b = insertTask(db, { status: "fail" });
  const rows = db.prepare("SELECT id, status FROM tasks WHERE id IN (?, ?)").all(a, b) as Array<{ status: string }>;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.status).sort(), ["fail", "in_queue"]);
});

test("tasks.status rejects unknown values", () => {
  const db = makeTestDb();
  assert.throws(() => insertTask(db, { status: "bogus" }), /CHECK/);
});

test("tasks new columns exist with sensible defaults", () => {
  const db = makeTestDb();
  const id = insertTask(db, {});
  const row = db.prepare("SELECT blocked_by, sandbox_iterations, fail_reason FROM tasks WHERE id = ?").get(id) as {
    blocked_by: string | null;
    sandbox_iterations: number;
    fail_reason: string | null;
  };
  assert.equal(row.blocked_by, null);
  assert.equal(row.sandbox_iterations, 0);
  assert.equal(row.fail_reason, null);
});

test("migrateTasksV2 preserves data and adds new columns on legacy DB", () => {
  const db = new Database(":memory:");
  // Simulate the OLD schema (pre-1.1)
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY DEFAULT (hex(randomblob(8))),
      project_id TEXT NOT NULL DEFAULT 'videoclaw',
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'review', 'blocked', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      worktree_name TEXT,
      session_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      prompt TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    INSERT INTO tasks (id, title, status) VALUES ('legacy-1', 'pre-existing', 'in_progress');
  `);

  migrateTasksV2(db);

  // Data preserved
  const row = db.prepare("SELECT id, title, status, blocked_by, sandbox_iterations, fail_reason FROM tasks WHERE id = 'legacy-1'").get() as any;
  assert.equal(row.title, "pre-existing");
  assert.equal(row.status, "in_progress");
  assert.equal(row.blocked_by, null);
  assert.equal(row.sandbox_iterations, 0);
  assert.equal(row.fail_reason, null);

  // New status values now allowed
  db.prepare("INSERT INTO tasks (id, title, status) VALUES ('new-1', 't', 'in_queue')").run();
  const r2 = db.prepare("SELECT status FROM tasks WHERE id = 'new-1'").get() as any;
  assert.equal(r2.status, "in_queue");
});

test("migrateTasksV2 is idempotent", () => {
  const db = makeTestDb();          // already migrated schema
  migrateTasksV2(db);                // should be no-op
  migrateTasksV2(db);                // still no-op
  const id = insertTask(db, { status: "fail" });
  const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get(id) as any;
  assert.equal(row.status, "fail");
});
