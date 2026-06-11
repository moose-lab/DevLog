import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrateTasksV2, migrateSessionsStatusCheck } from "../db";

/**
 * Regression tests for CR-1 / CR-2 (REVIEW-2026-06-10): table rebuilds must
 * run with foreign keys disabled, be detected via sqlite_master inspection,
 * and copy every shared column.
 */

/** Builds a pre-V2 database: old tasks CHECK, sessions with an FK to tasks. */
function makeLegacyV1Db(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
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
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      worktree_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'killed')),
      prompt TEXT,
      exit_code INTEGER,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT
    );
  `);
  return db;
}

test("migrateTasksV2 preserves sessions.task_id across the tasks rebuild (CR-1)", () => {
  const db = makeLegacyV1Db();
  db.prepare("INSERT INTO tasks (id, title, status) VALUES ('t1', 'legacy task', 'todo')").run();
  db.prepare(
    "INSERT INTO sessions (id, task_id, status) VALUES ('s1', 't1', 'completed')"
  ).run();

  migrateTasksV2(db);

  const session = db
    .prepare("SELECT task_id FROM sessions WHERE id = 's1'")
    .get() as { task_id: string | null };
  assert.equal(session.task_id, "t1");

  const violations = db.prepare("PRAGMA foreign_key_check").all();
  assert.deepEqual(violations, []);

  // The rebuilt table accepts the widened status set.
  db.prepare("INSERT INTO tasks (id, title, status) VALUES ('t2', 'queued', 'in_queue')").run();
  // FK enforcement is back on after the rebuild.
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
});

test("migrateTasksV2 keeps task data for legacy tables missing newer columns (CR-1)", () => {
  const db = makeLegacyV1Db();
  db.prepare(
    "INSERT INTO tasks (id, title, status, priority, prompt) VALUES ('t1', 'keep me', 'review', 'high', 'do things')"
  ).run();

  migrateTasksV2(db);

  const task = db
    .prepare("SELECT title, status, priority, prompt, sandbox_iterations FROM tasks WHERE id = 't1'")
    .get() as { title: string; status: string; priority: string; prompt: string; sandbox_iterations: number };
  assert.equal(task.title, "keep me");
  assert.equal(task.status, "review");
  assert.equal(task.priority, "high");
  assert.equal(task.prompt, "do things");
  assert.equal(task.sandbox_iterations, 0);
});

test("migrateSessionsStatusCheck widens legacy CHECK and preserves logs (CR-2)", () => {
  const db = makeLegacyV1Db();
  db.exec(`
    CREATE TABLE session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      chunk TEXT NOT NULL,
      stream TEXT NOT NULL DEFAULT 'stdout',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT INTO sessions (id, status, prompt) VALUES ('s1', 'running', 'hello')").run();
  db.prepare("INSERT INTO session_logs (session_id, chunk) VALUES ('s1', 'log line')").run();

  // Legacy CHECK rejects 'idle' before the migration runs.
  assert.throws(() =>
    db.prepare("UPDATE sessions SET status = 'idle' WHERE id = 's1'").run()
  );

  migrateSessionsStatusCheck(db);

  // Status CHECK is widened and prior data survived the rebuild.
  db.prepare("UPDATE sessions SET status = 'idle' WHERE id = 's1'").run();
  const session = db
    .prepare("SELECT status, prompt FROM sessions WHERE id = 's1'")
    .get() as { status: string; prompt: string };
  assert.equal(session.status, "idle");
  assert.equal(session.prompt, "hello");

  const logs = db.prepare("SELECT chunk FROM session_logs WHERE session_id = 's1'").all();
  assert.equal(logs.length, 1);

  const violations = db.prepare("PRAGMA foreign_key_check").all();
  assert.deepEqual(violations, []);
});

test("migrateSessionsStatusCheck is a no-op when the CHECK already includes idle/paused", () => {
  const db = makeLegacyV1Db();
  db.exec("DROP TABLE sessions");
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'idle', 'paused', 'completed', 'failed', 'killed')),
      started_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT INTO sessions (id, status) VALUES ('s1', 'idle')").run();
  const before = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'")
    .get() as { sql: string };

  migrateSessionsStatusCheck(db);

  const after = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'")
    .get() as { sql: string };
  assert.equal(after.sql, before.sql);
});
