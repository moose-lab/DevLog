import Database from "better-sqlite3";
import { SCHEMA } from "../db-schema";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}

export function insertTask(
  db: Database.Database,
  overrides: Partial<{ id: string; title: string; status: string; project_id: string; worktree_name: string }> = {}
): string {
  const id = overrides.id ?? `task-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(
    `INSERT INTO tasks (id, project_id, title, status, worktree_name)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    id,
    overrides.project_id ?? "test",
    overrides.title ?? "test task",
    overrides.status ?? "todo",
    overrides.worktree_name ?? null
  );
  return id;
}

export function insertSession(
  db: Database.Database,
  overrides: Partial<{ id: string; task_id: string; worktree_name: string; status: string; project_id: string }> = {}
): string {
  const id = overrides.id ?? `sess-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(
    `INSERT INTO sessions (id, project_id, task_id, worktree_name, status)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    id,
    overrides.project_id ?? "test",
    overrides.task_id ?? null,
    overrides.worktree_name ?? null,
    overrides.status ?? "running"
  );
  return id;
}

/** Minimal stub of ProcessManager API used by Scheduler/Suspender tests. */
export class FakeProcessManager {
  public spawned: Array<{ taskId: string; sessionId: string; resumeFrom?: string }> = [];
  public paused: string[] = [];

  async spawnAgent(opts: { taskId: string; sessionId: string; resumeFrom?: string }) {
    this.spawned.push(opts);
  }
  async pause(sessionId: string) {
    this.paused.push(sessionId);
  }
}

/**
 * Creates a temporary directory simulating a project root.
 * Optionally seeds .git/ to make it look like a real repo.
 * Returns absolute path; caller is responsible for cleanup via removeTempDir.
 */
export function makeTempProjectDir(opts: { withGit?: boolean; withPackageJson?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "devlog-test-project-"));
  if (opts.withGit) {
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  }
  if (opts.withPackageJson) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test-project" }));
  }
  return dir;
}

export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Returns a registry-DB-only path within a temp dir, plus a cleanup function.
 * Used for tests that need the actual file (not :memory:).
 */
export function makeTempRegistryPath(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "devlog-test-registry-"));
  return {
    path: join(dir, "registry.sqlite"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
