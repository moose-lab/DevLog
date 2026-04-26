import type { DbPool } from "./db-pool";
import type { ProjectRecord, ProjectCandidate } from "./types-project";

export interface Registry {
  list(): ProjectRecord[];
  get(id: string): ProjectRecord | null;
  create(input: { id: string; name: string; path: string; defaultBranch: string }): ProjectRecord;
  remove(id: string): void;
  touchActive(id: string): void;
  scan(rootPath: string, opts?: { maxDepth?: number }): ProjectCandidate[];
  syncFromConfigJson(configPath: string): { added: string[]; skipped: string[] };
  syncToConfigJson(configPath: string): void;
}

interface DbRow {
  id: string;
  name: string;
  path: string;
  default_branch: string;
  created_at: string;
  last_active_at: string | null;
}

function rowToRecord(row: DbRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    defaultBranch: row.default_branch,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

export function createRegistry(pool: DbPool): Registry {
  function reg() { return pool.getRegistry(); }

  const api: Registry = {
    list() {
      const rows = reg()
        .prepare("SELECT * FROM projects ORDER BY last_active_at DESC NULLS LAST, created_at DESC")
        .all() as DbRow[];
      return rows.map(rowToRecord);
    },
    get(id) {
      const row = reg().prepare("SELECT * FROM projects WHERE id = ?").get(id) as DbRow | undefined;
      return row ? rowToRecord(row) : null;
    },
    create(input) {
      reg().prepare(
        `INSERT INTO projects (id, name, path, default_branch) VALUES (?, ?, ?, ?)`
      ).run(input.id, input.name, input.path, input.defaultBranch);
      // Trigger lazy open so the per-project DB is created immediately
      pool.getProject(input.id);
      return api.get(input.id)!;
    },
    remove(id) {
      pool.closeProject(id);
      reg().prepare("DELETE FROM projects WHERE id = ?").run(id);
    },
    touchActive(id) {
      reg().prepare("UPDATE projects SET last_active_at = datetime('now') WHERE id = ?").run(id);
    },
    scan(_rootPath, _opts) {
      throw new Error("not implemented yet");  // Task 5.1
    },
    syncFromConfigJson(_configPath) {
      throw new Error("not implemented yet");  // Task 4.2
    },
    syncToConfigJson(_configPath) {
      throw new Error("not implemented yet");  // Task 4.2
    },
  };
  return api;
}
