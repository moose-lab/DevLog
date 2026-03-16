import { watch, type FSWatcher } from "chokidar";
import path from "path";
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

  watchWorktree(worktreeName: string, worktreePath: string, sessionId?: string): void {
    if (this.watchers.has(worktreeName)) return;

    const watcher = watch(worktreePath, {
      ignored: IGNORE_PATTERNS,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300 },
    });

    const handleChange = (filePath: string) => {
      const relativePath = path.relative(worktreePath, filePath);
      this.upsertLock(relativePath, worktreeName, sessionId ?? null);
      this.checkConflicts(relativePath, worktreeName);
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

  private upsertLock(filePath: string, worktreeName: string, sessionId: string | null): void {
    const db = getDb();

    const existing = db
      .prepare(
        "SELECT id FROM file_locks WHERE file_path = ? AND worktree_name = ? AND resolved_at IS NULL"
      )
      .get(filePath, worktreeName);

    if (existing) {
      db.prepare(
        "UPDATE file_locks SET detected_at = datetime('now'), session_id = COALESCE(?, session_id) WHERE file_path = ? AND worktree_name = ? AND resolved_at IS NULL"
      ).run(sessionId, filePath, worktreeName);
    } else {
      db.prepare(
        "INSERT INTO file_locks (file_path, worktree_name, session_id, lock_type) VALUES (?, ?, ?, 'write')"
      ).run(filePath, worktreeName, sessionId);
    }
  }

  private checkConflicts(filePath: string, worktreeName: string): void {
    const db = getDb();

    const conflicts = db
      .prepare(
        `SELECT worktree_name FROM file_locks
         WHERE file_path = ? AND worktree_name != ? AND resolved_at IS NULL`
      )
      .all(filePath, worktreeName) as { worktree_name: string }[];

    if (conflicts.length > 0) {
      // Mark as conflict
      db.prepare(
        "UPDATE file_locks SET lock_type = 'conflict' WHERE file_path = ? AND resolved_at IS NULL"
      ).run(filePath);

      const conflictWorktrees = [worktreeName, ...conflicts.map((c) => c.worktree_name)];

      // Emit conflict event to all relevant sessions
      streamManager.emit("conflicts", {
        type: "status",
        status: "conflict",
        content: JSON.stringify({ file_path: filePath, worktrees: conflictWorktrees }),
      });
    }
  }

  resolveConflict(filePath: string, worktreeName?: string): void {
    const db = getDb();
    if (worktreeName) {
      db.prepare(
        "UPDATE file_locks SET resolved_at = datetime('now') WHERE file_path = ? AND worktree_name = ?"
      ).run(filePath, worktreeName);
    } else {
      db.prepare(
        "UPDATE file_locks SET resolved_at = datetime('now') WHERE file_path = ?"
      ).run(filePath);
    }
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

// Singleton
const globalForWatcher = globalThis as unknown as { fileWatcher?: FileWatcher };
export const fileWatcher =
  globalForWatcher.fileWatcher ?? (globalForWatcher.fileWatcher = new FileWatcher());
