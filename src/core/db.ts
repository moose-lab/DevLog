import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { SCHEMA } from "./db-schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "devlog.db");

let _db: Database.Database | null = null;
let _recovered = false;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "logs"), { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(SCHEMA);

  // Migrate: add claude_session_id column if missing
  try {
    _db.exec("ALTER TABLE sessions ADD COLUMN claude_session_id TEXT");
  } catch {
    // Column already exists
  }

  // Migrate: update CHECK constraint to include 'idle' status
  // SQLite can't alter CHECK constraints, so recreate the table if needed
  try {
    _db.exec("UPDATE sessions SET status = 'idle' WHERE status = 'idle'");
  } catch {
    // CHECK constraint fails — need to recreate table
    _db.exec(`
      CREATE TABLE IF NOT EXISTS sessions_new (
        id TEXT PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        worktree_name TEXT, worktree_path TEXT, branch_name TEXT,
        pid INTEGER,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','idle','paused','completed','failed','killed')),
        claude_command TEXT, claude_session_id TEXT, prompt TEXT,
        exit_code INTEGER, log_path TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT
      );
      INSERT OR IGNORE INTO sessions_new SELECT id, task_id, worktree_name, worktree_path, branch_name, pid, status, claude_command, claude_session_id, prompt, exit_code, log_path, started_at, ended_at FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);
    `);
  }

  // Migrate: add project_id columns if missing
  for (const table of ["tasks", "sessions", "file_locks"]) {
    try {
      _db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT NOT NULL DEFAULT 'videoclaw'`);
    } catch {
      // Column already exists
    }
  }

  // Migrate: update tasks CHECK constraint to include 'review' and 'blocked'
  try {
    _db.exec("UPDATE tasks SET status = 'review' WHERE status = 'review'");
  } catch {
    // CHECK constraint fails — recreate table with expanded constraint
    _db.exec(`
      CREATE TABLE IF NOT EXISTS tasks_new (
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
      INSERT OR IGNORE INTO tasks_new SELECT * FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(status, sort_order);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
    `);
  }

  // Recover orphaned sessions on first access
  if (!_recovered) {
    _recovered = true;
    recoverOrphanedSessions(_db);
  }

  return _db;
}

function recoverOrphanedSessions(db: Database.Database): void {
  const orphaned = db
    .prepare("SELECT id, pid FROM sessions WHERE status IN ('running', 'idle', 'paused', 'pending')")
    .all() as { id: string; pid: number | null }[];

  for (const session of orphaned) {
    let alive = false;
    if (session.pid) {
      try {
        process.kill(session.pid, 0); // Check if process exists
        alive = true;
      } catch {
        alive = false;
      }
    }

    if (!alive) {
      db.prepare(
        "UPDATE sessions SET status = 'failed', ended_at = datetime('now') WHERE id = ?"
      ).run(session.id);
    }
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// Graceful shutdown
function shutdown() {
  try {
    // Import processManager dynamically to avoid circular deps
    const { processManager } = require("./process-manager");
    processManager.killAll();
  } catch {
    // process-manager might not be loaded
  }
  closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
