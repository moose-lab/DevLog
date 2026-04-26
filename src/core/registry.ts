import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
    syncFromConfigJson(configPath) {
      if (!existsSync(configPath)) return { added: [], skipped: [] };
      const cfg = JSON.parse(readFileSync(configPath, "utf8")) as {
        projects?: Array<{ id: string; name: string; path: string; defaultBranch?: string }>;
      };
      const added: string[] = [];
      const skipped: string[] = [];
      for (const p of cfg.projects ?? []) {
        if (api.get(p.id)) {
          skipped.push(p.id);
          continue;
        }
        api.create({ id: p.id, name: p.name, path: p.path, defaultBranch: p.defaultBranch ?? "main" });
        added.push(p.id);
      }
      return { added, skipped };
    },
    syncToConfigJson(configPath) {
      let existing: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        existing = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      }
      const projects = api.list().map(p => ({
        id: p.id,
        name: p.name,
        path: p.path,
        defaultBranch: p.defaultBranch,
      }));
      const next = { ...existing, projects };
      writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n");
    },
  };
  return api;
}
