export const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(8))),
  project_id TEXT NOT NULL DEFAULT 'videoclaw',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_queue', 'in_progress', 'review', 'blocked', 'fail', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
  worktree_name TEXT,
  session_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  prompt TEXT,
  blocked_by TEXT,
  sandbox_iterations INTEGER NOT NULL DEFAULT 0,
  fail_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'videoclaw',
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  worktree_name TEXT,
  worktree_path TEXT,
  branch_name TEXT,
  pid INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'idle', 'paused', 'completed', 'failed', 'killed')),
  claude_command TEXT,
  claude_session_id TEXT,
  prompt TEXT,
  exit_code INTEGER,
  log_path TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS file_locks (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(8))),
  project_id TEXT NOT NULL DEFAULT 'videoclaw',
  file_path TEXT NOT NULL,
  worktree_name TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  lock_type TEXT NOT NULL DEFAULT 'write' CHECK(lock_type IN ('write', 'conflict')),
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS session_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  chunk TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT 'stdout' CHECK(stream IN ('stdout', 'stderr')),
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_path ON file_locks(file_path);
CREATE INDEX IF NOT EXISTS idx_file_locks_active ON file_locks(file_path, resolved_at);
CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_file_locks_project ON file_locks(project_id, file_path);

CREATE VIEW IF NOT EXISTS active_conflicts AS
SELECT
  l1.file_path,
  l1.worktree_name AS worktree_a,
  l2.worktree_name AS worktree_b,
  l1.detected_at
FROM file_locks l1
JOIN file_locks l2
  ON l1.file_path = l2.file_path
  AND l1.worktree_name < l2.worktree_name
  AND l1.resolved_at IS NULL
  AND l2.resolved_at IS NULL;
`;
