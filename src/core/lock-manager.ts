import type Database from "better-sqlite3";

export interface AcquireRequest {
  sessionId: string;
  worktreeName: string;
  projectId: string;
  paths: string[];
}

export type AcquireResult =
  | { ok: true; acquired: string[] }
  | { ok: false; conflictingSessionIds: string[]; conflictingPaths: string[] };

export interface LockManager {
  acquire(req: AcquireRequest): AcquireResult;
  release(sessionId: string, paths?: string[]): void;
  releaseAll(sessionId: string): void;
  whoHolds(filePath: string): string | null;
}

export function createLockManager(db: Database.Database): LockManager {
  const insertLock = db.prepare(
    `INSERT INTO file_locks (project_id, file_path, worktree_name, session_id, lock_type)
     VALUES (?, ?, ?, ?, 'write')`
  );
  const findHolder = db.prepare(
    `SELECT session_id FROM file_locks WHERE file_path = ? AND resolved_at IS NULL LIMIT 1`
  );
  const releaseStmt = db.prepare(
    `UPDATE file_locks SET resolved_at = datetime('now') WHERE session_id = ? AND file_path = ? AND resolved_at IS NULL`
  );
  const releaseAllStmt = db.prepare(
    `UPDATE file_locks SET resolved_at = datetime('now') WHERE session_id = ? AND resolved_at IS NULL`
  );

  return {
    acquire(req) {
      const conflicts: { sessionId: string; path: string }[] = [];
      for (const p of req.paths) {
        const holder = findHolder.get(p) as { session_id: string } | undefined;
        if (holder && holder.session_id !== req.sessionId) {
          conflicts.push({ sessionId: holder.session_id, path: p });
        }
      }
      if (conflicts.length > 0) {
        return {
          ok: false,
          conflictingSessionIds: [...new Set(conflicts.map(c => c.sessionId))],
          conflictingPaths: conflicts.map(c => c.path),
        };
      }
      const tx = db.transaction((paths: string[]) => {
        for (const p of paths) insertLock.run(req.projectId, p, req.worktreeName, req.sessionId);
      });
      tx(req.paths);
      return { ok: true, acquired: req.paths };
    },
    release(sessionId, paths) {
      if (!paths) {
        releaseAllStmt.run(sessionId);
        return;
      }
      const tx = db.transaction(() => {
        for (const p of paths) releaseStmt.run(sessionId, p);
      });
      tx();
    },
    releaseAll(sessionId) {
      releaseAllStmt.run(sessionId);
    },
    whoHolds(filePath) {
      const r = findHolder.get(filePath) as { session_id: string } | undefined;
      return r?.session_id ?? null;
    },
  };
}
