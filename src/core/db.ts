import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { SCHEMA, sessionsTableDdl, tasksTableDdl } from "./db-schema";
// Circular at module level (task-lifecycle uses getDb), but both sides only
// touch each other's exports inside function bodies, which ESM resolves.
import { markSessionFailedAndReleaseLinkedTask } from "./task-lifecycle";
import {
  DEFAULT_AGENT_TEAM_ID,
  DEFAULT_CODING_AGENT_ID,
} from "./agent-presets";
import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_SESSION_AUTH_MODE,
} from "./session-runtime-auth";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_API_MAX_TOKENS,
  DEFAULT_API_PROTOCOL,
} from "./agent-settings";
import {
  DEFAULT_LOCAL_CLI_AGENT_ID,
  DEFAULT_LOCAL_CLI_REASONING,
} from "./local-cli-agent-definitions";

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
  migrateTasksV2(_db);
  migrateControlPlaneColumns(_db);

  // Migrate: add claude_session_id column if missing
  try {
    _db.exec("ALTER TABLE sessions ADD COLUMN claude_session_id TEXT");
  } catch {
    // Column already exists
  }

  // Migrate: widen the sessions status CHECK ('idle'/'paused') when a legacy
  // table is detected. SQLite can't alter CHECK constraints, so this rebuilds.
  migrateSessionsStatusCheck(_db);

  // Migrate: add project_id columns if missing
  for (const table of ["tasks", "sessions", "file_locks"]) {
    try {
      _db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT NOT NULL DEFAULT 'videoclaw'`);
    } catch {
      // Column already exists
    }
  }

  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN coding_agent_id TEXT NOT NULL DEFAULT '${DEFAULT_CODING_AGENT_ID}'`,
    );
  } catch {
    // Column already exists
  }
  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN agent_team_id TEXT NOT NULL DEFAULT '${DEFAULT_AGENT_TEAM_ID}'`,
    );
  } catch {
    // Column already exists
  }
  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN session_auth_mode TEXT NOT NULL DEFAULT '${DEFAULT_SESSION_AUTH_MODE}'`,
    );
  } catch {
    // Column already exists
  }
  try {
    _db.exec("ALTER TABLE sessions ADD COLUMN agent_api_key_env_var TEXT");
  } catch {
    // Column already exists
  }
  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN local_cli_agent_id TEXT NOT NULL DEFAULT '${DEFAULT_LOCAL_CLI_AGENT_ID}'`,
    );
  } catch {
    // Column already exists
  }
  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN agent_model TEXT NOT NULL DEFAULT '${DEFAULT_AGENT_MODEL}'`,
    );
  } catch {
    // Column already exists
  }
  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN agent_reasoning TEXT NOT NULL DEFAULT '${DEFAULT_LOCAL_CLI_REASONING}'`,
    );
  } catch {
    // Column already exists
  }
  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN agent_api_protocol TEXT NOT NULL DEFAULT '${DEFAULT_API_PROTOCOL}'`,
    );
  } catch {
    // Column already exists
  }
  try {
    _db.exec("ALTER TABLE sessions ADD COLUMN agent_api_version TEXT NOT NULL DEFAULT ''");
  } catch {
    // Column already exists
  }
  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN agent_base_url TEXT NOT NULL DEFAULT '${DEFAULT_API_BASE_URL}'`,
    );
  } catch {
    // Column already exists
  }
  try {
    _db.exec(
      `ALTER TABLE sessions ADD COLUMN agent_max_tokens INTEGER NOT NULL DEFAULT ${DEFAULT_API_MAX_TOKENS}`,
    );
  } catch {
    // Column already exists
  }

  // Recover orphaned sessions on first access
  if (!_recovered) {
    _recovered = true;
    recoverOrphanedSessions(_db);
  }

  return _db;
}

export function migrateTasksV2(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  const has = (n: string) => cols.some(c => c.name === n);

  if (!has("blocked_by")) {
    db.exec("ALTER TABLE tasks ADD COLUMN blocked_by TEXT");
  }
  if (!has("sandbox_iterations")) {
    db.exec("ALTER TABLE tasks ADD COLUMN sandbox_iterations INTEGER NOT NULL DEFAULT 0");
  }
  if (!has("fail_reason")) {
    db.exec("ALTER TABLE tasks ADD COLUMN fail_reason TEXT");
  }
  if (!has("current_stage")) {
    db.exec("ALTER TABLE tasks ADD COLUMN current_stage TEXT");
  }
  if (!has("gate_status")) {
    db.exec("ALTER TABLE tasks ADD COLUMN gate_status TEXT");
  }

  // Status CHECK widening: SQLite cannot ALTER CHECK; recreate the table only if old CHECK is detected.
  const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
  if (stmt && (!stmt.sql.includes("'in_queue'") || !stmt.sql.includes("'fail'"))) {
    rebuildTable(
      db,
      "tasks",
      tasksTableDdl("tasks_new"),
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
       CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(status, sort_order);
       CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);`
    );
  }
}

/**
 * Widens the sessions status CHECK to include 'idle'/'paused' on legacy DBs.
 * Detection is via sqlite_master SQL inspection — an UPDATE probe can never
 * trip the old constraint because forbidden values can't already be stored.
 */
export function migrateSessionsStatusCheck(db: Database.Database): void {
  const stmt = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'")
    .get() as { sql: string } | undefined;
  if (!stmt || (stmt.sql.includes("'idle'") && stmt.sql.includes("'paused'"))) {
    return;
  }
  rebuildTable(
    db,
    "sessions",
    sessionsTableDdl("sessions_new"),
    `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
     CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);
     CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, status);`
  );
}

/**
 * Rebuilds a table following SQLite's documented table-rebuild procedure:
 * foreign keys OFF for the duration, copy the intersection of old/new columns
 * (legacy tables may lack newer ones), then verify with foreign_key_check.
 * With FKs left ON, `DROP TABLE` fires ON DELETE actions in referencing
 * tables — e.g. nulling every sessions.task_id (CR-1) or cascade-deleting
 * session logs (CR-2).
 */
function rebuildTable(
  db: Database.Database,
  table: string,
  createNewSql: string,
  postSql = ""
): void {
  const fkWasOn = db.pragma("foreign_keys", { simple: true }) === 1;
  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`DROP TABLE IF EXISTS ${table}_new`);
    db.exec(createNewSql);
    const columnsOf = (name: string) =>
      (db.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>).map(
        (col) => col.name
      );
    const newColumns = new Set(columnsOf(`${table}_new`));
    const shared = columnsOf(table)
      .filter((col) => newColumns.has(col))
      .map((col) => `"${col}"`)
      .join(", ");
    db.exec(`
      BEGIN;
      INSERT INTO ${table}_new (${shared}) SELECT ${shared} FROM ${table};
      DROP TABLE ${table};
      ALTER TABLE ${table}_new RENAME TO ${table};
      ${postSql}
      COMMIT;
    `);
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(
        `foreign_key_check reported ${violations.length} violation(s) after rebuilding ${table}`
      );
    }
  } catch (err) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw err;
  } finally {
    if (fkWasOn) db.pragma("foreign_keys = ON");
  }
}

export function migrateControlPlaneColumns(db: Database.Database): void {
  for (const table of ["tasks", "sessions"]) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const has = (name: string) => cols.some((col) => col.name === name);

    if (!has("current_stage")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN current_stage TEXT`);
    }
    if (!has("gate_status")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN gate_status TEXT`);
    }
  }
}

export function recoverOrphanedSessions(db: Database.Database): void {
  const orphaned = db
    .prepare(
      "SELECT id, pid, status, gate_status FROM sessions WHERE status IN ('running', 'idle', 'paused', 'pending')",
    )
    .all() as {
      id: string;
      pid: number | null;
      status: string;
      gate_status: string | null;
    }[];

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
      if (session.status === "paused" && session.gate_status) {
        continue;
      }
      // IM-8: release the linked task too — failing only the session left
      // tasks 'in_progress' pointing at a dead session, unable to relaunch.
      markSessionFailedAndReleaseLinkedTask(
        db,
        session.id,
        "Session process was lost (server restart or crash) and could not be recovered."
      );
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
