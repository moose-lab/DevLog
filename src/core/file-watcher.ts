import { watch, type FSWatcher } from "chokidar";
import path from "path";
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { streamManager } from "./stream-manager";

const IGNORE_PATTERNS = [
  /(^|[/\\])\../, // dotfiles
  /node_modules/,
  /__pycache__/,
  /\.venv/,
  /\.next/,
  /\.git/,
];

class FileWatcher {
  private watchers = new Map<string, FSWatcher>();
  private repoRoot: string;

  constructor() {
    this.repoRoot = path.resolve(process.cwd(), "..");
  }

  watchWorktree(
    worktreeName: string,
    worktreePath: string,
    sessionId?: string,
    projectId?: string,
  ): void {
    if (this.watchers.has(worktreeName)) return;

    const watcher = watch(worktreePath, {
      ignored: IGNORE_PATTERNS,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300 },
    });

    const handleChange = (filePath: string) => {
      const relativePath = path.relative(worktreePath, filePath);
      recordWorktreeFileLock(getDb(), {
        projectId: projectId ?? null,
        filePath: relativePath,
        worktreeName,
        sessionId: sessionId ?? null,
      });
      const conflictWorktrees = detectAndMarkConflicts(getDb(), {
        projectId: projectId ?? null,
        filePath: relativePath,
        worktreeName,
      });
      if (conflictWorktrees.length > 0) {
        streamManager.emit("conflicts", {
          type: "status",
          status: "conflict",
          content: JSON.stringify({
            file_path: relativePath,
            worktrees: [worktreeName, ...conflictWorktrees],
          }),
        });
      }
    };

    watcher.on("change", handleChange);
    watcher.on("add", handleChange);

    this.watchers.set(worktreeName, watcher);
  }

  unwatchWorktree(worktreeName: string): void {
    const watcher = this.watchers.get(worktreeName);
    if (watcher) {
      watcher.close();
      this.watchers.delete(worktreeName);
    }
  }

  resolveConflict(filePath: string, worktreeName?: string, projectId?: string): void {
    resolveFileLock(getDb(), {
      projectId: projectId ?? null,
      filePath,
      worktreeName,
    });
  }

  closeAll(): void {
    for (const [name] of this.watchers) {
      this.unwatchWorktree(name);
    }
  }

  getWatchedCount(): number {
    return this.watchers.size;
  }
}

interface FileLockScope {
  /** Null preserves the schema default for legacy callers without a project. */
  projectId: string | null;
  filePath: string;
  worktreeName: string;
}

/**
 * Records a write lock for a changed file. Locks are scoped by project —
 * the previous INSERT omitted project_id, so every row defaulted to
 * 'videoclaw' and project-scoped conflict queries returned empty for all
 * other projects (REVIEW-2026-06-10 suggestions; latent IM-level bug).
 */
export function recordWorktreeFileLock(
  db: Database.Database,
  input: FileLockScope & { sessionId: string | null },
): void {
  const existing = db
    .prepare(
      "SELECT id FROM file_locks WHERE file_path = ? AND worktree_name = ? AND resolved_at IS NULL"
    )
    .get(input.filePath, input.worktreeName);

  if (existing) {
    db.prepare(
      "UPDATE file_locks SET detected_at = datetime('now'), session_id = COALESCE(?, session_id) WHERE file_path = ? AND worktree_name = ? AND resolved_at IS NULL"
    ).run(input.sessionId, input.filePath, input.worktreeName);
  } else if (input.projectId) {
    db.prepare(
      "INSERT INTO file_locks (project_id, file_path, worktree_name, session_id, lock_type) VALUES (?, ?, ?, ?, 'write')"
    ).run(input.projectId, input.filePath, input.worktreeName, input.sessionId);
  } else {
    db.prepare(
      "INSERT INTO file_locks (file_path, worktree_name, session_id, lock_type) VALUES (?, ?, ?, 'write')"
    ).run(input.filePath, input.worktreeName, input.sessionId);
  }
}

/** Marks same-project locks on the file as conflicting; returns the other worktrees. */
export function detectAndMarkConflicts(
  db: Database.Database,
  input: FileLockScope,
): string[] {
  const scope = input.projectId ? " AND project_id = ?" : "";
  const scopeArgs = input.projectId ? [input.projectId] : [];
  const conflicts = db
    .prepare(
      `SELECT worktree_name FROM file_locks
       WHERE file_path = ? AND worktree_name != ? AND resolved_at IS NULL${scope}`
    )
    .all(input.filePath, input.worktreeName, ...scopeArgs) as { worktree_name: string }[];

  if (conflicts.length === 0) return [];

  db.prepare(
    `UPDATE file_locks SET lock_type = 'conflict' WHERE file_path = ? AND resolved_at IS NULL${scope}`
  ).run(input.filePath, ...scopeArgs);

  return conflicts.map((c) => c.worktree_name);
}

export function resolveFileLock(
  db: Database.Database,
  input: { projectId: string | null; filePath: string; worktreeName?: string },
): void {
  const scope = input.projectId ? " AND project_id = ?" : "";
  const scopeArgs = input.projectId ? [input.projectId] : [];
  if (input.worktreeName) {
    db.prepare(
      `UPDATE file_locks SET resolved_at = datetime('now') WHERE file_path = ? AND worktree_name = ?${scope}`
    ).run(input.filePath, input.worktreeName, ...scopeArgs);
  } else {
    db.prepare(
      `UPDATE file_locks SET resolved_at = datetime('now') WHERE file_path = ?${scope}`
    ).run(input.filePath, ...scopeArgs);
  }
}

// Singleton
const globalForWatcher = globalThis as unknown as { fileWatcher?: FileWatcher };
export const fileWatcher =
  globalForWatcher.fileWatcher ?? (globalForWatcher.fileWatcher = new FileWatcher());
