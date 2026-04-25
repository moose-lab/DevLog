# Per-Project Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DevLog's single-DB-multi-project model with per-project SQLite files (`<project_path>/.devlog/devlog.db`) plus a global registry (`~/.config/devlog/registry.sqlite`). Add APIs for project registration and filesystem scan so users build/discover projects from the Dashboard without touching infrastructure.

**Architecture:** A `DbPool` module owns all SQLite connections (lazy open, LRU close) and exposes `getRegistry()` + `getProject(projectId)`. A `Registry` module wraps the registry DB with project CRUD + filesystem scan. Existing API routes are retrofitted to take `?project=<id>` and route to the appropriate per-project DB. Plan A's `Scheduler / LockManager / Suspender` modules already accept a `db: Database` parameter so they're decoupled from the source — only their factory wiring changes.

**Tech Stack:** TypeScript 5, Next.js 16 API routes, `better-sqlite3` for SQLite, Node's built-in `node --test` runner via `tsx` (already set up in Plan A's Phase 0).

**Spec reference:** `docs/superpowers/specs/2026-04-25-per-project-storage-design.md`

**Push rule:** Each task ends with `git push origin feat/per-project-storage`. Spec/plan documents are local-only (do not push).

---

## File Structure

**New files:**
- `src/core/db-schema-registry.ts` — registry-only schema (projects + settings tables)
- `src/core/db-pool.ts` — connection pool (lazy open, LRU close, registry + project access)
- `src/core/registry.ts` — projects CRUD + filesystem scan + JSON sync
- `src/core/__tests__/db-pool.test.ts`
- `src/core/__tests__/registry.test.ts`
- `src/app/api/projects/route.ts` — GET list / POST create
- `src/app/api/projects/[id]/route.ts` — DELETE remove
- `src/app/api/projects/[id]/activate/route.ts` — POST activate
- `src/app/api/projects/scan/route.ts` — POST discover candidates
- `src/app/api/projects/scan/register/route.ts` — POST batch-register
- `scripts/migrate-to-per-project.ts` — one-time data migration

**Modified files:**
- `src/core/__tests__/test-helpers.ts` — add `makeTempProjectDir`, `makeTestPool` helpers
- `src/core/types-project.ts` — add `ProjectRecord`, `ProjectCandidate`
- `src/core/db.ts` — `getDb()` → `getDb(projectId)`; route through pool
- `src/core/config.ts` — bridge to registry; reads `activeProject` setting
- `src/app/api/tasks/route.ts` — read `?project=`; default to active
- `src/app/api/tasks/[id]/route.ts` — same
- `src/app/api/tasks/[id]/execute/route.ts` — same
- `src/app/api/tasks/[id]/retry/route.ts` — same
- `src/app/api/tasks/[id]/pr/route.ts` — same
- `src/app/api/tasks/reorder/route.ts` — same
- `src/app/api/sessions/**` — same retrofit pattern
- `src/app/api/worktrees/**` — same
- `src/app/api/locks/**` — same

---

## Phase 1 — Test Helpers Extension

### Task 1.1: Add temp project dir + test pool helpers

**Files:**
- Modify: `src/core/__tests__/test-helpers.ts`

- [ ] **Step 1: Read the current test-helpers.ts to confirm the existing exports**

Run: `cat src/core/__tests__/test-helpers.ts | head -30`
Expected: see `makeTestDb`, `insertTask`, `insertSession`, `FakeProcessManager`.

- [ ] **Step 2: Append new helpers**

Append to `src/core/__tests__/test-helpers.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Smoke test the new helpers compile**

Add a temporary test file `src/core/__tests__/_helpers-smoke.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { makeTempProjectDir, removeTempDir, makeTempRegistryPath } from "./test-helpers";

test("makeTempProjectDir creates dir, optional .git", () => {
  const d = makeTempProjectDir({ withGit: true });
  assert.equal(existsSync(d), true);
  assert.equal(existsSync(`${d}/.git/HEAD`), true);
  removeTempDir(d);
  assert.equal(existsSync(d), false);
});

test("makeTempRegistryPath returns path + cleanup", () => {
  const { path, cleanup } = makeTempRegistryPath();
  assert.equal(typeof path, "string");
  cleanup();
});
```

Run: `npm test -- --test-name-pattern="makeTemp"`
Expected: 2 pass.

- [ ] **Step 5: Delete the smoke file (it's just a sanity check)**

Run: `rm src/core/__tests__/_helpers-smoke.test.ts`

- [ ] **Step 6: Commit + push**

```bash
git add src/core/__tests__/test-helpers.ts
git commit -m "test: add temp project dir + registry path helpers"
git push origin feat/per-project-storage
```

---

## Phase 2 — Registry Schema

### Task 2.1: Create registry-only schema module

**Files:**
- Create: `src/core/db-schema-registry.ts`
- Create: `src/core/__tests__/db-schema-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/db-schema-registry.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { REGISTRY_SCHEMA } from "../db-schema-registry";

test("REGISTRY_SCHEMA creates projects table with required columns", () => {
  const db = new Database(":memory:");
  db.exec(REGISTRY_SCHEMA);
  const cols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string; notnull: number }>;
  const names = cols.map(c => c.name).sort();
  assert.deepEqual(names, ["created_at", "default_branch", "id", "last_active_at", "name", "path"]);
});

test("REGISTRY_SCHEMA creates settings table with key+value", () => {
  const db = new Database(":memory:");
  db.exec(REGISTRY_SCHEMA);
  const cols = db.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>;
  const names = cols.map(c => c.name).sort();
  assert.deepEqual(names, ["key", "updated_at", "value"]);
});

test("REGISTRY_SCHEMA enforces unique project paths", () => {
  const db = new Database(":memory:");
  db.exec(REGISTRY_SCHEMA);
  db.prepare("INSERT INTO projects (id, name, path) VALUES ('a', 'A', '/foo')").run();
  assert.throws(
    () => db.prepare("INSERT INTO projects (id, name, path) VALUES ('b', 'B', '/foo')").run(),
    /UNIQUE/
  );
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- --test-name-pattern="REGISTRY_SCHEMA"`
Expected: 3 failures (module not found).

- [ ] **Step 3: Implement schema**

Create `src/core/db-schema-registry.ts`:

```ts
export const REGISTRY_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(last_active_at DESC);
`;
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --test-name-pattern="REGISTRY_SCHEMA"`
Expected: 3 pass.

- [ ] **Step 5: Commit + push**

```bash
git add src/core/db-schema-registry.ts src/core/__tests__/db-schema-registry.test.ts
git commit -m "feat(registry): add registry SQLite schema"
git push origin feat/per-project-storage
```

---

## Phase 3 — DbPool

### Task 3.1: DbPool — registry path + getRegistry()

**Files:**
- Create: `src/core/db-pool.ts`
- Create: `src/core/__tests__/db-pool.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/db-pool.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDbPool } from "../db-pool";
import { makeTempRegistryPath } from "./test-helpers";

test("getRegistry creates the registry DB file lazily", () => {
  const { path, cleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: path });
  assert.equal(existsSync(path), false);    // not yet created
  const db = pool.getRegistry();
  assert.equal(existsSync(path), true);     // now exists
  // Schema applied:
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>;
  const names = tables.map(t => t.name);
  assert.ok(names.includes("projects"));
  assert.ok(names.includes("settings"));
  pool.closeAll();
  cleanup();
});

test("getRegistry returns same connection across calls (cached)", () => {
  const { path, cleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: path });
  const a = pool.getRegistry();
  const b = pool.getRegistry();
  assert.equal(a, b);
  pool.closeAll();
  cleanup();
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- --test-name-pattern="getRegistry"`
Expected: 2 failures (module not found).

- [ ] **Step 3: Implement minimal**

Create `src/core/db-pool.ts`:

```ts
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { REGISTRY_SCHEMA } from "./db-schema-registry";
import { SCHEMA } from "./db-schema";
import { migrateTasksV2 } from "./db";

export interface DbPool {
  getRegistry(): Database.Database;
  getProject(projectId: string): Database.Database;
  closeProject(projectId: string): void;
  closeAll(): void;
}

export interface DbPoolOptions {
  registryPath?: string;
  resolveProjectDbPath?: (projectId: string) => string;
  maxOpen?: number;
}

const DEFAULT_REGISTRY_PATH = join(homedir(), ".config", "devlog", "registry.sqlite");

export function createDbPool(opts: DbPoolOptions = {}): DbPool {
  const registryPath = opts.registryPath ?? DEFAULT_REGISTRY_PATH;
  let registryDb: Database.Database | null = null;
  const projectDbs = new Map<string, Database.Database>();

  function openRegistry(): Database.Database {
    mkdirSync(dirname(registryPath), { recursive: true });
    const db = new Database(registryPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(REGISTRY_SCHEMA);
    return db;
  }

  return {
    getRegistry() {
      if (!registryDb) registryDb = openRegistry();
      return registryDb;
    },
    getProject(_projectId) {
      throw new Error("not implemented yet");  // Task 3.2
    },
    closeProject(_projectId) {
      throw new Error("not implemented yet");  // Task 3.2
    },
    closeAll() {
      if (registryDb) { registryDb.close(); registryDb = null; }
      for (const db of projectDbs.values()) db.close();
      projectDbs.clear();
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --test-name-pattern="getRegistry"`
Expected: 2 pass.

- [ ] **Step 5: Commit + push**

```bash
git add src/core/db-pool.ts src/core/__tests__/db-pool.test.ts
git commit -m "feat(db-pool): registry connection management"
git push origin feat/per-project-storage
```

### Task 3.2: DbPool — getProject() with lazy open

**Files:**
- Modify: `src/core/db-pool.ts`
- Modify: `src/core/__tests__/db-pool.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/core/__tests__/db-pool.test.ts`:

```ts
import { join as pathJoin } from "node:path";
import { existsSync as fileExists } from "node:fs";
import { makeTempProjectDir, removeTempDir } from "./test-helpers";

test("getProject creates .devlog/devlog.db inside the project path", () => {
  const projectDir = makeTempProjectDir();
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({
    registryPath: regPath,
    resolveProjectDbPath: (id) => pathJoin(projectDir, ".devlog", "devlog.db"),
  });

  const db = pool.getProject("test-project");
  assert.equal(fileExists(pathJoin(projectDir, ".devlog", "devlog.db")), true);

  // Schema applied — tasks table exists:
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
  assert.ok(tables.some(t => t.name === "tasks"));

  pool.closeAll();
  regCleanup();
  removeTempDir(projectDir);
});

test("getProject caches connections per projectId", () => {
  const projectDir = makeTempProjectDir();
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({
    registryPath: regPath,
    resolveProjectDbPath: () => pathJoin(projectDir, ".devlog", "devlog.db"),
  });

  const a = pool.getProject("p1");
  const b = pool.getProject("p1");
  assert.equal(a, b);

  pool.closeAll();
  regCleanup();
  removeTempDir(projectDir);
});

test("closeProject closes and removes from cache", () => {
  const projectDir = makeTempProjectDir();
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({
    registryPath: regPath,
    resolveProjectDbPath: () => pathJoin(projectDir, ".devlog", "devlog.db"),
  });

  const a = pool.getProject("p1");
  pool.closeProject("p1");
  // Re-opening should give a fresh connection (not the closed one):
  const b = pool.getProject("p1");
  assert.notEqual(a, b);

  pool.closeAll();
  regCleanup();
  removeTempDir(projectDir);
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- --test-name-pattern="getProject|closeProject"`
Expected: 3 failures ("not implemented yet").

- [ ] **Step 3: Implement getProject and closeProject**

In `src/core/db-pool.ts`, replace the `getProject` and `closeProject` placeholder bodies:

```ts
getProject(projectId) {
  const cached = projectDbs.get(projectId);
  if (cached) return cached;
  if (!opts.resolveProjectDbPath) {
    // Default: look up registry for project.path, then append /.devlog/devlog.db
    const reg = this.getRegistry();
    const row = reg.prepare("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string } | undefined;
    if (!row) throw new Error(`Project not found in registry: ${projectId}`);
    const dbPath = join(row.path, ".devlog", "devlog.db");
    return openProjectDb(projectId, dbPath);
  }
  return openProjectDb(projectId, opts.resolveProjectDbPath(projectId));
},

closeProject(projectId) {
  const db = projectDbs.get(projectId);
  if (db) { db.close(); projectDbs.delete(projectId); }
},
```

Add the helper above the return statement:

```ts
function openProjectDb(projectId: string, dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrateTasksV2(db);
  projectDbs.set(projectId, db);
  return db;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --test-name-pattern="getProject|closeProject"`
Expected: 3 pass.

- [ ] **Step 5: Commit + push**

```bash
git add src/core/db-pool.ts src/core/__tests__/db-pool.test.ts
git commit -m "feat(db-pool): per-project lazy open + close"
git push origin feat/per-project-storage
```

### Task 3.3: DbPool — LRU eviction when maxOpen exceeded

**Files:**
- Modify: `src/core/db-pool.ts`
- Modify: `src/core/__tests__/db-pool.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/core/__tests__/db-pool.test.ts`:

```ts
test("getProject evicts least-recently-used when maxOpen exceeded", () => {
  const dir1 = makeTempProjectDir();
  const dir2 = makeTempProjectDir();
  const dir3 = makeTempProjectDir();
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const dirs: Record<string, string> = { p1: dir1, p2: dir2, p3: dir3 };
  const pool = createDbPool({
    registryPath: regPath,
    resolveProjectDbPath: (id) => pathJoin(dirs[id], ".devlog", "devlog.db"),
    maxOpen: 2,
  });

  const a1 = pool.getProject("p1");
  const a2 = pool.getProject("p2");
  // p1 and p2 open; opening p3 should evict p1 (LRU)
  pool.getProject("p3");
  // Re-opening p1 should give a fresh connection (it was evicted)
  const a1Again = pool.getProject("p1");
  assert.notEqual(a1, a1Again);
  // p2 should still be the same (it was used after p1)
  const a2Again = pool.getProject("p2");
  assert.equal(a2, a2Again);

  pool.closeAll();
  regCleanup();
  for (const d of [dir1, dir2, dir3]) removeTempDir(d);
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- --test-name-pattern="evicts least-recently-used"`
Expected: 1 failure (no eviction; both connections returned same).

- [ ] **Step 3: Implement LRU**

In `src/core/db-pool.ts`, change `projectDbs` from `Map` to a touch-order Map and add eviction inside `openProjectDb`:

Replace the `const projectDbs = new Map<...>()` line with:

```ts
const projectDbs = new Map<string, Database.Database>();
const maxOpen = opts.maxOpen ?? 8;
```

Modify `getProject` cache hit path to refresh LRU order:

```ts
getProject(projectId) {
  const cached = projectDbs.get(projectId);
  if (cached) {
    // Refresh LRU: delete + re-insert places at end of Map iteration order
    projectDbs.delete(projectId);
    projectDbs.set(projectId, cached);
    return cached;
  }
  // ... rest unchanged
},
```

In `openProjectDb`, evict before insert:

```ts
function openProjectDb(projectId: string, dbPath: string): Database.Database {
  while (projectDbs.size >= maxOpen) {
    const oldestKey = projectDbs.keys().next().value as string;
    const oldestDb = projectDbs.get(oldestKey)!;
    oldestDb.close();
    projectDbs.delete(oldestKey);
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrateTasksV2(db);
  projectDbs.set(projectId, db);
  return db;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --test-name-pattern="evicts least-recently-used"`
Expected: 1 pass. Re-run all `db-pool` tests: `npm test -- --test-name-pattern="db-pool|getRegistry|getProject|closeProject|evicts"` — confirm 6 pass.

- [ ] **Step 5: Commit + push**

```bash
git add src/core/db-pool.ts src/core/__tests__/db-pool.test.ts
git commit -m "feat(db-pool): LRU eviction with maxOpen cap"
git push origin feat/per-project-storage
```

---

## Phase 4 — Registry CRUD

### Task 4.1: ProjectRecord type + Registry interface skeleton

**Files:**
- Modify: `src/core/types-project.ts`
- Create: `src/core/registry.ts`
- Create: `src/core/__tests__/registry.test.ts`

- [ ] **Step 1: Read existing types-project.ts to find where to add types**

Run: `cat src/core/types-project.ts`
Expected: see existing `ProjectConfig` type or interface.

- [ ] **Step 2: Append types to `src/core/types-project.ts`**

```ts
export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface ProjectCandidate {
  suggestedId: string;
  name: string;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
}
```

- [ ] **Step 3: Write the failing test**

Create `src/core/__tests__/registry.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createDbPool } from "../db-pool";
import { createRegistry } from "../registry";
import { makeTempProjectDir, removeTempDir, makeTempRegistryPath } from "./test-helpers";

test("create() inserts a project and creates its .devlog/devlog.db", () => {
  const projectDir = makeTempProjectDir({ withGit: true });
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);

  const rec = registry.create({
    id: "test-proj",
    name: "Test Project",
    path: projectDir,
    defaultBranch: "main",
  });

  assert.equal(rec.id, "test-proj");
  assert.equal(rec.path, projectDir);
  assert.equal(typeof rec.createdAt, "string");
  assert.equal(rec.lastActiveAt, null);
  assert.equal(existsSync(join(projectDir, ".devlog", "devlog.db")), true);

  pool.closeAll();
  regCleanup();
  removeTempDir(projectDir);
});

test("get() returns null for unknown project", () => {
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);
  assert.equal(registry.get("nonexistent"), null);
  pool.closeAll();
  regCleanup();
});

test("list() returns inserted projects sorted by lastActiveAt then createdAt desc", () => {
  const d1 = makeTempProjectDir();
  const d2 = makeTempProjectDir();
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);

  registry.create({ id: "a", name: "A", path: d1, defaultBranch: "main" });
  registry.create({ id: "b", name: "B", path: d2, defaultBranch: "main" });

  const items = registry.list();
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(p => p.id).sort(), ["a", "b"]);

  pool.closeAll();
  regCleanup();
  removeTempDir(d1);
  removeTempDir(d2);
});

test("remove() deletes registry row but keeps .devlog/ data", () => {
  const projectDir = makeTempProjectDir();
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);

  registry.create({ id: "p", name: "P", path: projectDir, defaultBranch: "main" });
  assert.equal(existsSync(join(projectDir, ".devlog", "devlog.db")), true);

  registry.remove("p");
  assert.equal(registry.get("p"), null);
  // Data preserved:
  assert.equal(existsSync(join(projectDir, ".devlog", "devlog.db")), true);

  pool.closeAll();
  regCleanup();
  removeTempDir(projectDir);
});

test("touchActive() updates lastActiveAt", () => {
  const projectDir = makeTempProjectDir();
  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);

  registry.create({ id: "p", name: "P", path: projectDir, defaultBranch: "main" });
  registry.touchActive("p");
  const rec = registry.get("p")!;
  assert.notEqual(rec.lastActiveAt, null);

  pool.closeAll();
  regCleanup();
  removeTempDir(projectDir);
});
```

- [ ] **Step 4: Run — expect failure**

Run: `npm test -- --test-name-pattern="create|get\\(\\)|list\\(\\)|remove\\(\\)|touchActive"`
Expected: 5 failures (module not found).

- [ ] **Step 5: Implement Registry**

Create `src/core/registry.ts`:

```ts
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

  return {
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
      return this.get(input.id)!;
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
}
```

- [ ] **Step 6: Run — expect pass**

Run: `npm test -- --test-name-pattern="create|get\\(\\)|list\\(\\)|remove\\(\\)|touchActive"`
Expected: 5 pass.

- [ ] **Step 7: Commit + push**

```bash
git add src/core/types-project.ts src/core/registry.ts src/core/__tests__/registry.test.ts
git commit -m "feat(registry): project CRUD + touchActive"
git push origin feat/per-project-storage
```

### Task 4.2: Registry — JSON sync helpers

**Files:**
- Modify: `src/core/registry.ts`
- Modify: `src/core/__tests__/registry.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/core/__tests__/registry.test.ts`:

```ts
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

test("syncFromConfigJson registers projects from JSON, skips already-registered", () => {
  const d1 = makeTempProjectDir();
  const d2 = makeTempProjectDir();
  const cfgDir = mkdtempSync(join(tmpdir(), "devlog-cfg-"));
  const cfgPath = join(cfgDir, "devlog.config.json");
  writeFileSync(cfgPath, JSON.stringify({
    projects: [
      { id: "alpha", name: "Alpha", path: d1, defaultBranch: "main" },
      { id: "beta", name: "Beta", path: d2, defaultBranch: "main" },
    ],
    activeProject: "alpha",
    port: 3333,
  }));

  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);

  // First sync: both added
  const r1 = registry.syncFromConfigJson(cfgPath);
  assert.deepEqual(r1.added.sort(), ["alpha", "beta"]);
  assert.deepEqual(r1.skipped, []);

  // Second sync: both skipped
  const r2 = registry.syncFromConfigJson(cfgPath);
  assert.deepEqual(r2.added, []);
  assert.deepEqual(r2.skipped.sort(), ["alpha", "beta"]);

  pool.closeAll();
  regCleanup();
  removeTempDir(d1);
  removeTempDir(d2);
});

test("syncToConfigJson writes registry projects back to JSON, preserves other fields", () => {
  const d1 = makeTempProjectDir();
  const cfgDir = mkdtempSync(join(tmpdir(), "devlog-cfg-"));
  const cfgPath = join(cfgDir, "devlog.config.json");
  writeFileSync(cfgPath, JSON.stringify({ projects: [], activeProject: "x", port: 9999 }));

  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);

  registry.create({ id: "alpha", name: "Alpha", path: d1, defaultBranch: "main" });
  registry.syncToConfigJson(cfgPath);

  const after = JSON.parse(readFileSync(cfgPath, "utf8"));
  assert.equal(after.activeProject, "x");          // preserved
  assert.equal(after.port, 9999);                   // preserved
  assert.equal(after.projects.length, 1);
  assert.equal(after.projects[0].id, "alpha");
  assert.equal(after.projects[0].path, d1);

  pool.closeAll();
  regCleanup();
  removeTempDir(d1);
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- --test-name-pattern="syncFromConfigJson|syncToConfigJson"`
Expected: 2 failures ("not implemented yet").

- [ ] **Step 3: Implement sync methods**

In `src/core/registry.ts`, add at top of file:

```ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
```

Replace the `syncFromConfigJson` and `syncToConfigJson` placeholders:

```ts
syncFromConfigJson(configPath) {
  if (!existsSync(configPath)) return { added: [], skipped: [] };
  const cfg = JSON.parse(readFileSync(configPath, "utf8")) as {
    projects?: Array<{ id: string; name: string; path: string; defaultBranch?: string }>;
  };
  const added: string[] = [];
  const skipped: string[] = [];
  for (const p of cfg.projects ?? []) {
    if (this.get(p.id)) {
      skipped.push(p.id);
      continue;
    }
    this.create({ id: p.id, name: p.name, path: p.path, defaultBranch: p.defaultBranch ?? "main" });
    added.push(p.id);
  }
  return { added, skipped };
},

syncToConfigJson(configPath) {
  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    existing = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  }
  const projects = this.list().map(p => ({
    id: p.id,
    name: p.name,
    path: p.path,
    defaultBranch: p.defaultBranch,
  }));
  const next = { ...existing, projects };
  writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n");
},
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --test-name-pattern="syncFromConfigJson|syncToConfigJson"`
Expected: 2 pass.

- [ ] **Step 5: Commit + push**

```bash
git add src/core/registry.ts src/core/__tests__/registry.test.ts
git commit -m "feat(registry): bidirectional sync with devlog.config.json"
git push origin feat/per-project-storage
```

---

## Phase 5 — Filesystem Scan

### Task 5.1: Registry.scan walks dir tree, finds git repos

**Files:**
- Modify: `src/core/registry.ts`
- Modify: `src/core/__tests__/registry.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/core/__tests__/registry.test.ts`:

```ts
import { mkdirSync as mkdir, writeFileSync as wf } from "node:fs";

test("scan finds git repos under root, returns ProjectCandidate[]", () => {
  // Build tree:
  //   root/
  //     proj-a/.git/  (with package.json)
  //     proj-b/.git/  (no package.json)
  //     not-a-repo/   (no .git)
  //     nested/proj-c/.git/  (depth 2)
  const root = mkdtempSync(join(tmpdir(), "devlog-scan-"));
  const a = join(root, "proj-a");
  const b = join(root, "proj-b");
  const notRepo = join(root, "not-a-repo");
  const c = join(root, "nested", "proj-c");
  for (const d of [a, b, notRepo, c]) mkdir(d, { recursive: true });
  for (const d of [a, b, c]) {
    mkdir(join(d, ".git"), { recursive: true });
    wf(join(d, ".git", "HEAD"), "ref: refs/heads/main\n");
  }
  wf(join(a, "package.json"), "{}");

  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);

  const candidates = registry.scan(root, { maxDepth: 4 });
  const ids = candidates.map(c => c.suggestedId).sort();
  assert.deepEqual(ids, ["proj-a", "proj-b", "proj-c"]);

  const projA = candidates.find(c => c.suggestedId === "proj-a")!;
  assert.equal(projA.hasGit, true);
  assert.equal(projA.hasPackageJson, true);
  assert.equal(projA.path, a);

  const projB = candidates.find(c => c.suggestedId === "proj-b")!;
  assert.equal(projB.hasPackageJson, false);

  pool.closeAll();
  regCleanup();
  rmSync(root, { recursive: true, force: true });
});

test("scan respects maxDepth", () => {
  const root = mkdtempSync(join(tmpdir(), "devlog-scan-depth-"));
  const deep = join(root, "a", "b", "c", "deep-repo");
  mkdir(deep, { recursive: true });
  mkdir(join(deep, ".git"), { recursive: true });
  wf(join(deep, ".git", "HEAD"), "ref: refs/heads/main\n");

  const { path: regPath, cleanup: regCleanup } = makeTempRegistryPath();
  const pool = createDbPool({ registryPath: regPath });
  const registry = createRegistry(pool);

  // Depth 2: should NOT find the repo at depth 4
  const shallow = registry.scan(root, { maxDepth: 2 });
  assert.equal(shallow.length, 0);

  // Depth 5: SHOULD find it
  const deeper = registry.scan(root, { maxDepth: 5 });
  assert.equal(deeper.length, 1);

  pool.closeAll();
  regCleanup();
  rmSync(root, { recursive: true, force: true });
});
```

Add `rmSync` and `mkdirSync as mkdir, writeFileSync as wf` imports at top of test file if not already present (the existing test file already imports `existsSync`; add what's missing).

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- --test-name-pattern="scan"`
Expected: 2 failures ("not implemented yet").

- [ ] **Step 3: Implement scan**

In `src/core/registry.ts`, add at top:

```ts
import { readdirSync, statSync } from "node:fs";
import { basename, join as pathJoin } from "node:path";
```

Replace the `scan` placeholder:

```ts
scan(rootPath, opts) {
  const maxDepth = opts?.maxDepth ?? 4;
  const results: ProjectCandidate[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;  // unreadable
    }

    // If this dir has .git, it IS a project — record and don't recurse into it
    if (entries.includes(".git")) {
      const hasPackageJson = entries.includes("package.json");
      results.push({
        suggestedId: basename(dir),
        name: basename(dir),
        path: dir,
        hasGit: true,
        hasPackageJson,
      });
      return;
    }

    // Otherwise recurse into subdirectories
    for (const entry of entries) {
      const child = pathJoin(dir, entry);
      let stats;
      try { stats = statSync(child); } catch { continue; }
      if (stats.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
        walk(child, depth + 1);
      }
    }
  }

  walk(rootPath, 1);
  return results;
},
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --test-name-pattern="scan"`
Expected: 2 pass.

- [ ] **Step 5: Commit + push**

```bash
git add src/core/registry.ts src/core/__tests__/registry.test.ts
git commit -m "feat(registry): filesystem scan for git repos"
git push origin feat/per-project-storage
```

---

## Phase 6 — db.ts Refactor

### Task 6.1: Replace getDb() singleton with pool-backed getDb(projectId)

**Files:**
- Modify: `src/core/db.ts`

This task is a non-TDD refactor (no behavior change visible in tests we already have for db; we're swapping the implementation). The success criterion is "all existing tests still pass" + "no callers break at typecheck".

- [ ] **Step 1: Check current getDb signature usage**

Run: `grep -rn "getDb()" src --include="*.ts" | head -20`
Expected: list of call sites in API routes / task-lifecycle / process-manager.

- [ ] **Step 2: Refactor `src/core/db.ts`**

Replace the entire file content with:

```ts
import Database from "better-sqlite3";
import { createDbPool, type DbPool } from "./db-pool";

let _pool: DbPool | null = null;

function getPool(): DbPool {
  if (!_pool) _pool = createDbPool();
  return _pool;
}

/**
 * Returns the SQLite handle for a given project.
 * If projectId is omitted, falls back to the active project from devlog.config.json
 * (resolved via config.ts).
 */
export function getDb(projectId?: string): Database.Database {
  if (!projectId) {
    // Lazy import to avoid circular dep
    const { getActiveProjectId } = require("./config") as { getActiveProjectId: () => string };
    projectId = getActiveProjectId();
  }
  return getPool().getProject(projectId);
}

/** For tests only. */
export function _resetPoolForTests(): void {
  if (_pool) _pool.closeAll();
  _pool = null;
}

export function closeDb(): void {
  if (_pool) { _pool.closeAll(); _pool = null; }
}

// Re-export migrateTasksV2 since db-pool needs it
export { migrateTasksV2 } from "./db-migrations";

// Graceful shutdown
function shutdown() {
  try {
    const { processManager } = require("./process-manager");
    processManager.killAll();
  } catch { /* not loaded */ }
  closeDb();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

- [ ] **Step 3: Move `migrateTasksV2` and `recoverOrphanedSessions` to a new file**

Create `src/core/db-migrations.ts`:

```ts
import type Database from "better-sqlite3";

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

  const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
  if (stmt && (!stmt.sql.includes("'in_queue'") || !stmt.sql.includes("'fail'"))) {
    db.exec(`
      CREATE TABLE tasks_new (
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
      INSERT INTO tasks_new (id, project_id, title, description, status, priority, worktree_name, session_id, sort_order, prompt, blocked_by, sandbox_iterations, fail_reason, created_at, updated_at, completed_at)
      SELECT id, project_id, title, description, status, priority, worktree_name, session_id, sort_order, prompt, NULL, 0, NULL, created_at, updated_at, completed_at
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(status, sort_order);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
    `);
  }
}

export function recoverOrphanedSessions(db: Database.Database): void {
  const orphaned = db
    .prepare("SELECT id, pid FROM sessions WHERE status IN ('running', 'idle', 'paused', 'pending')")
    .all() as { id: string; pid: number | null }[];

  for (const session of orphaned) {
    let alive = false;
    if (session.pid) {
      try {
        process.kill(session.pid, 0);
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
```

- [ ] **Step 4: Update `src/core/db-pool.ts` to import from db-migrations**

In `src/core/db-pool.ts`, change:
```ts
import { migrateTasksV2 } from "./db";
```
to:
```ts
import { migrateTasksV2, recoverOrphanedSessions } from "./db-migrations";
```

And in `openProjectDb`, after `migrateTasksV2(db)`, add `recoverOrphanedSessions(db);`.

- [ ] **Step 5: Stub config.ts getActiveProjectId**

Read `src/core/config.ts`. If there's no `getActiveProjectId` export, add at the bottom:

```ts
export function getActiveProjectId(): string {
  // For backward compat: read activeProject from the JSON config.
  // If absent, use the first project's id, else throw.
  const cfg = loadConfig();  // assume existing helper; if not, inline-load JSON
  if (cfg.activeProject) return cfg.activeProject;
  if (cfg.projects?.[0]?.id) return cfg.projects[0].id;
  throw new Error("No active project configured");
}
```

If the existing config.ts uses a different loader function name, adapt. If unclear, **STOP and report NEEDS_CONTEXT**.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: zero new errors. If a caller breaks because it required `getDb()` to return something specific, fix locally only if obvious; otherwise report DONE_WITH_CONCERNS.

- [ ] **Step 7: Re-run the existing test suite**

Run: `npm test`
Expected: all existing tests still pass (db-schema, lock-manager, db-pool, registry, smoke, db-schema-registry — count varies based on phase progress).

If any test fails because it was using `getDb()` directly, that test needs a `_resetPoolForTests()` setup — but since none of our existing Plan A or per-project tests use `getDb()` at all (they use `makeTestDb()`), this should be a no-op.

- [ ] **Step 8: Commit + push**

```bash
git add src/core/db.ts src/core/db-migrations.ts src/core/db-pool.ts src/core/config.ts
git commit -m "refactor(db): route getDb through DbPool, extract migrations"
git push origin feat/per-project-storage
```

---

## Phase 7 — API: Project Management Endpoints

### Task 7.1: GET /api/projects + POST /api/projects

**Files:**
- Create: `src/app/api/projects/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/projects/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createDbPool } from "@/core/db-pool";
import { createRegistry } from "@/core/registry";
import { existsSync } from "node:fs";

let _registry: ReturnType<typeof createRegistry> | null = null;
function getRegistry() {
  if (!_registry) _registry = createRegistry(createDbPool());
  return _registry;
}

export async function GET() {
  return NextResponse.json({ projects: getRegistry().list() });
}

export async function POST(req: Request) {
  const body = await req.json() as { id: string; name: string; path: string; defaultBranch?: string };

  if (!body.id || !body.name || !body.path) {
    return NextResponse.json({ error: "id, name, path are required" }, { status: 400 });
  }
  if (!existsSync(body.path)) {
    return NextResponse.json({ error: `Project path does not exist: ${body.path}` }, { status: 400 });
  }

  const reg = getRegistry();
  if (reg.get(body.id)) {
    return NextResponse.json({ error: `Project id already exists: ${body.id}`, project: reg.get(body.id) }, { status: 409 });
  }

  try {
    const created = reg.create({
      id: body.id,
      name: body.name,
      path: body.path,
      defaultBranch: body.defaultBranch ?? "main",
    });
    return NextResponse.json({ project: created }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: `Path already registered to another project: ${body.path}` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual smoke test**

Start dev server in this worktree: `npm run dev` (background)

Then:
```bash
curl http://localhost:3333/api/projects
# Expected: { "projects": [...] }   (empty or pre-existing list depending on registry state)

curl -X POST http://localhost:3333/api/projects \
  -H "Content-Type: application/json" \
  -d '{"id":"smoke-test","name":"Smoke","path":"/tmp"}'
# Expected: { "project": { id: "smoke-test", path: "/tmp", ... } } with 201
```

Cleanup the smoke test record:
```bash
sqlite3 ~/.config/devlog/registry.sqlite "DELETE FROM projects WHERE id='smoke-test'"
rm -rf /tmp/.devlog
```

- [ ] **Step 3: Commit + push**

```bash
git add src/app/api/projects/route.ts
git commit -m "feat(api): GET/POST /api/projects"
git push origin feat/per-project-storage
```

### Task 7.2: DELETE /api/projects/[id]

**Files:**
- Create: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/projects/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createDbPool } from "@/core/db-pool";
import { createRegistry } from "@/core/registry";

let _registry: ReturnType<typeof createRegistry> | null = null;
function getRegistry() {
  if (!_registry) _registry = createRegistry(createDbPool());
  return _registry;
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const reg = getRegistry();
  const existing = reg.get(id);
  if (!existing) {
    return NextResponse.json({ error: `Project not found: ${id}` }, { status: 404 });
  }
  reg.remove(id);
  return NextResponse.json({ removed: id, dataPreservedAt: `${existing.path}/.devlog` });
}
```

- [ ] **Step 2: Manual smoke**

```bash
# Re-add smoke project
curl -X POST http://localhost:3333/api/projects \
  -H "Content-Type: application/json" \
  -d '{"id":"smoke-test","name":"Smoke","path":"/tmp"}'

# Delete it
curl -X DELETE http://localhost:3333/api/projects/smoke-test
# Expected: { "removed": "smoke-test", "dataPreservedAt": "/tmp/.devlog" }

# Confirm gone from list
curl http://localhost:3333/api/projects | grep smoke-test || echo "OK: removed"
```

Cleanup: `rm -rf /tmp/.devlog`

- [ ] **Step 3: Commit + push**

```bash
git add src/app/api/projects/[id]/route.ts
git commit -m "feat(api): DELETE /api/projects/[id]"
git push origin feat/per-project-storage
```

### Task 7.3: POST /api/projects/[id]/activate

**Files:**
- Create: `src/app/api/projects/[id]/activate/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/projects/[id]/activate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createDbPool } from "@/core/db-pool";
import { createRegistry } from "@/core/registry";
import { setActiveProjectId } from "@/core/config";

let _registry: ReturnType<typeof createRegistry> | null = null;
function getRegistry() {
  if (!_registry) _registry = createRegistry(createDbPool());
  return _registry;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const reg = getRegistry();
  if (!reg.get(id)) {
    return NextResponse.json({ error: `Project not found: ${id}` }, { status: 404 });
  }
  reg.touchActive(id);
  setActiveProjectId(id);  // writes back to devlog.config.json
  return NextResponse.json({ active: id });
}
```

- [ ] **Step 2: Implement `setActiveProjectId` in config.ts**

In `src/core/config.ts`, add:

```ts
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const CONFIG_PATH = process.cwd() + "/devlog.config.json";

export function setActiveProjectId(id: string): void {
  let cfg: Record<string, unknown> = {};
  if (existsSync(CONFIG_PATH)) {
    cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  }
  cfg.activeProject = id;
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}
```

- [ ] **Step 3: Manual smoke**

```bash
# Pre-condition: devlog.config.json has at least one project (e.g., videoclaw)
curl -X POST http://localhost:3333/api/projects/videoclaw/activate
# Expected: { "active": "videoclaw" }
cat devlog.config.json | grep activeProject
# Expected: "activeProject": "videoclaw"
```

- [ ] **Step 4: Commit + push**

```bash
git add src/app/api/projects/[id]/activate/route.ts src/core/config.ts
git commit -m "feat(api): POST /api/projects/[id]/activate"
git push origin feat/per-project-storage
```

### Task 7.4: POST /api/projects/scan + /api/projects/scan/register

**Files:**
- Create: `src/app/api/projects/scan/route.ts`
- Create: `src/app/api/projects/scan/register/route.ts`

- [ ] **Step 1: Write the scan route**

Create `src/app/api/projects/scan/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createDbPool } from "@/core/db-pool";
import { createRegistry } from "@/core/registry";
import { existsSync } from "node:fs";

let _registry: ReturnType<typeof createRegistry> | null = null;
function getRegistry() {
  if (!_registry) _registry = createRegistry(createDbPool());
  return _registry;
}

export async function POST(req: Request) {
  const body = await req.json() as { rootPath: string; maxDepth?: number };
  if (!body.rootPath) {
    return NextResponse.json({ error: "rootPath required" }, { status: 400 });
  }
  if (!existsSync(body.rootPath)) {
    return NextResponse.json({ error: `Path does not exist: ${body.rootPath}` }, { status: 400 });
  }
  const candidates = getRegistry().scan(body.rootPath, { maxDepth: body.maxDepth });
  return NextResponse.json({ candidates });
}
```

- [ ] **Step 2: Write the bulk-register route**

Create `src/app/api/projects/scan/register/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createDbPool } from "@/core/db-pool";
import { createRegistry } from "@/core/registry";
import type { ProjectCandidate } from "@/core/types-project";

let _registry: ReturnType<typeof createRegistry> | null = null;
function getRegistry() {
  if (!_registry) _registry = createRegistry(createDbPool());
  return _registry;
}

export async function POST(req: Request) {
  const body = await req.json() as { candidates: ProjectCandidate[] };
  if (!Array.isArray(body.candidates)) {
    return NextResponse.json({ error: "candidates must be an array" }, { status: 400 });
  }

  const reg = getRegistry();
  const registered: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const c of body.candidates) {
    if (reg.get(c.suggestedId)) {
      skipped.push({ id: c.suggestedId, reason: "id already registered" });
      continue;
    }
    try {
      reg.create({
        id: c.suggestedId,
        name: c.name,
        path: c.path,
        defaultBranch: "main",
      });
      registered.push(c.suggestedId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push({ id: c.suggestedId, reason: msg.includes("UNIQUE") ? "path already registered" : msg });
    }
  }

  return NextResponse.json({ registered, skipped });
}
```

- [ ] **Step 3: Manual smoke**

```bash
# Scan ~/Moose/ (or any dir with git repos)
curl -X POST http://localhost:3333/api/projects/scan \
  -H "Content-Type: application/json" \
  -d '{"rootPath":"/Users/moose/Moose"}'
# Expected: { "candidates": [{suggestedId: "DevLog", ...}, {suggestedId: "videoclaw", ...}, ...] }

# Pick one and bulk-register (using a candidate from above response)
# (skip if already registered; should report skipped with reason)
```

- [ ] **Step 4: Commit + push**

```bash
git add src/app/api/projects/scan/route.ts src/app/api/projects/scan/register/route.ts
git commit -m "feat(api): scan filesystem for project candidates"
git push origin feat/per-project-storage
```

---

## Phase 8 — API: Retrofit Existing Endpoints

### Task 8.1: Add a `getProjectIdFromRequest` helper

**Files:**
- Create: `src/lib/project-context.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/project-context.ts`:

```ts
import { getActiveProjectId } from "@/core/config";

export function getProjectIdFromRequest(req: Request): string {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("project");
  if (fromQuery) return fromQuery;
  const fromHeader = req.headers.get("X-Project-Id");
  if (fromHeader) return fromHeader;
  return getActiveProjectId();
}
```

- [ ] **Step 2: Smoke compile**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/project-context.ts
git commit -m "feat: getProjectIdFromRequest helper"
git push origin feat/per-project-storage
```

### Task 8.2: Retrofit `/api/tasks` routes

**Files:**
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/app/api/tasks/[id]/execute/route.ts`
- Modify: `src/app/api/tasks/[id]/retry/route.ts`
- Modify: `src/app/api/tasks/[id]/pr/route.ts`
- Modify: `src/app/api/tasks/reorder/route.ts`

- [ ] **Step 1: Read each route to find the `getDb()` call**

Run: `grep -l "getDb()" src/app/api/tasks` (recursive: `grep -rln "getDb()" src/app/api/tasks`)
Expected: list of files (the 6 above).

- [ ] **Step 2: For each file, replace `getDb()` with `getDb(getProjectIdFromRequest(req))`**

For each route handler in the 6 files:
- Add import: `import { getProjectIdFromRequest } from "@/lib/project-context";`
- Find the `getDb()` call inside the handler
- Replace with `getDb(getProjectIdFromRequest(req))`
- Make sure the handler signature has `req: Request` — if it currently uses `_req`, rename to `req`

Important: don't change anything else. If a route doesn't use Request (e.g., uses NextRequest), use that type instead. If a route does multiple `getDb()` calls in different functions in the same file, hoist `const projectId = getProjectIdFromRequest(req); const db = getDb(projectId);` once at the top of the handler.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no NEW errors. (Existing kanban exhaustiveness errors from Plan A's T1.2 are deferred; OK.)

- [ ] **Step 4: Manual smoke**

Restart dev server. Then:
```bash
# Default (active project)
curl http://localhost:3333/api/tasks
# Expected: tasks list (matches active project)

# With ?project= override
curl "http://localhost:3333/api/tasks?project=videoclaw"
# Expected: same response if videoclaw is the active project
```

- [ ] **Step 5: Commit + push**

```bash
git add src/app/api/tasks
git commit -m "refactor(api): tasks routes route to per-project DB"
git push origin feat/per-project-storage
```

### Task 8.3: Retrofit `/api/sessions` routes

**Files:**
- Modify: every route under `src/app/api/sessions/**`

- [ ] **Step 1: Find all route files**

Run: `find src/app/api/sessions -name "route.ts"`
Expected: list of route handler files.

- [ ] **Step 2: Apply the same retrofit pattern as Task 8.2**

For each `getDb()` call inside a route handler, replace with `getDb(getProjectIdFromRequest(req))`. Add the `getProjectIdFromRequest` import.

For SSE streaming routes that don't have a per-call `req` available throughout, capture `projectId` once at the start of the handler.

- [ ] **Step 3: Typecheck + manual smoke**

Run: `npm run typecheck`
Smoke:
```bash
curl http://localhost:3333/api/sessions
# Expected: sessions list (active project's sessions)
```

- [ ] **Step 4: Commit + push**

```bash
git add src/app/api/sessions
git commit -m "refactor(api): sessions routes route to per-project DB"
git push origin feat/per-project-storage
```

### Task 8.4: Retrofit `/api/worktrees` and `/api/locks` routes

**Files:**
- Modify: every route under `src/app/api/worktrees/**` and `src/app/api/locks/**`

- [ ] **Step 1: Find all route files**

Run: `find src/app/api/worktrees src/app/api/locks -name "route.ts"`

- [ ] **Step 2: Apply same retrofit pattern**

- [ ] **Step 3: Typecheck + smoke**

```bash
curl http://localhost:3333/api/worktrees
curl http://localhost:3333/api/locks
```

- [ ] **Step 4: Commit + push**

```bash
git add src/app/api/worktrees src/app/api/locks
git commit -m "refactor(api): worktrees + locks routes route to per-project DB"
git push origin feat/per-project-storage
```

---

## Phase 9 — Data Migration Script

### Task 9.1: Write `scripts/migrate-to-per-project.ts`

**Files:**
- Create: `scripts/migrate-to-per-project.ts`
- Create: `src/core/__tests__/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/migrate.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SCHEMA } from "../db-schema";
import { migrateToPerProject } from "../../../scripts/migrate-to-per-project";

test("migrateToPerProject moves rows to per-project DBs by project_id", () => {
  // Old single DB with rows for two projects
  const oldDir = mkdtempSync(join(tmpdir(), "migrate-old-"));
  const oldDbPath = join(oldDir, "devlog.db");
  const old = new Database(oldDbPath);
  old.exec(SCHEMA);
  old.prepare("INSERT INTO tasks (id, project_id, title) VALUES ('t1', 'alpha', 'Task A')").run();
  old.prepare("INSERT INTO tasks (id, project_id, title) VALUES ('t2', 'alpha', 'Task A2')").run();
  old.prepare("INSERT INTO tasks (id, project_id, title) VALUES ('t3', 'beta', 'Task B')").run();
  old.close();

  // Create the project paths the migration will write to
  const alphaDir = mkdtempSync(join(tmpdir(), "migrate-alpha-"));
  const betaDir = mkdtempSync(join(tmpdir(), "migrate-beta-"));

  const result = migrateToPerProject({
    oldDbPath,
    projects: [
      { id: "alpha", path: alphaDir },
      { id: "beta", path: betaDir },
    ],
  });

  assert.deepEqual(result.migrated, { alpha: 2, beta: 1 });

  // Verify per-project DBs have correct rows
  const alphaDb = new Database(join(alphaDir, ".devlog", "devlog.db"));
  const alphaRows = alphaDb.prepare("SELECT id FROM tasks ORDER BY id").all() as Array<{ id: string }>;
  assert.deepEqual(alphaRows.map(r => r.id), ["t1", "t2"]);
  alphaDb.close();

  const betaDb = new Database(join(betaDir, ".devlog", "devlog.db"));
  const betaRows = betaDb.prepare("SELECT id FROM tasks").all() as Array<{ id: string }>;
  assert.deepEqual(betaRows.map(r => r.id), ["t3"]);
  betaDb.close();

  // Old DB renamed to .legacy
  assert.equal(existsSync(oldDbPath), false);
  assert.equal(existsSync(`${oldDbPath}.legacy`), true);

  // Cleanup
  rmSync(oldDir, { recursive: true, force: true });
  rmSync(alphaDir, { recursive: true, force: true });
  rmSync(betaDir, { recursive: true, force: true });
});

test("migrateToPerProject is idempotent (no-op if all projects already migrated)", () => {
  const oldDir = mkdtempSync(join(tmpdir(), "migrate-idempo-"));
  const oldDbPath = join(oldDir, "devlog.db");
  const old = new Database(oldDbPath);
  old.exec(SCHEMA);
  old.close();

  const alphaDir = mkdtempSync(join(tmpdir(), "migrate-alpha-i-"));
  // Pre-create the per-project DB with non-empty data to simulate "already migrated"
  mkdirSync(join(alphaDir, ".devlog"), { recursive: true });
  const pre = new Database(join(alphaDir, ".devlog", "devlog.db"));
  pre.exec(SCHEMA);
  pre.prepare("INSERT INTO tasks (id, project_id, title) VALUES ('existing', 'alpha', 'Pre-existing')").run();
  pre.close();

  const result = migrateToPerProject({
    oldDbPath,
    projects: [{ id: "alpha", path: alphaDir }],
  });

  assert.equal(result.skipped.includes("alpha"), true);
  // Pre-existing data still there:
  const after = new Database(join(alphaDir, ".devlog", "devlog.db"));
  const cnt = (after.prepare("SELECT COUNT(*) AS n FROM tasks").get() as { n: number }).n;
  assert.equal(cnt, 1);
  after.close();

  rmSync(oldDir, { recursive: true, force: true });
  rmSync(alphaDir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- --test-name-pattern="migrateToPerProject"`
Expected: 2 failures (module not found).

- [ ] **Step 3: Implement the script**

Create `scripts/migrate-to-per-project.ts`:

```ts
import Database from "better-sqlite3";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { SCHEMA } from "../src/core/db-schema";
import { migrateTasksV2 } from "../src/core/db-migrations";

export interface MigrateOptions {
  oldDbPath: string;
  projects: Array<{ id: string; path: string }>;
}

export interface MigrateResult {
  migrated: Record<string, number>;   // project id → rows migrated
  skipped: string[];                   // project ids skipped (already had data)
}

const TABLES = ["tasks", "sessions", "file_locks", "session_logs", "session_messages"];

export function migrateToPerProject(opts: MigrateOptions): MigrateResult {
  const result: MigrateResult = { migrated: {}, skipped: [] };
  if (!existsSync(opts.oldDbPath)) return result;

  const oldDb = new Database(opts.oldDbPath, { readonly: false });
  oldDb.exec(SCHEMA);
  migrateTasksV2(oldDb);

  let anyWork = false;

  for (const proj of opts.projects) {
    const newDbPath = join(proj.path, ".devlog", "devlog.db");
    mkdirSync(dirname(newDbPath), { recursive: true });
    const newDb = new Database(newDbPath);
    newDb.pragma("journal_mode = WAL");
    newDb.exec(SCHEMA);
    migrateTasksV2(newDb);

    // Idempotency: if the per-project DB already has any rows for this project, skip
    const hasRows = (newDb.prepare("SELECT COUNT(*) AS n FROM tasks").get() as { n: number }).n > 0;
    if (hasRows) {
      result.skipped.push(proj.id);
      newDb.close();
      continue;
    }

    let total = 0;
    const tx = newDb.transaction(() => {
      for (const table of TABLES) {
        // Only tables that have project_id column can be filtered
        const cols = newDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        const hasProjectId = cols.some(c => c.name === "project_id");
        const hasSessionId = cols.some(c => c.name === "session_id");

        if (hasProjectId) {
          const rows = oldDb.prepare(`SELECT * FROM ${table} WHERE project_id = ?`).all(proj.id) as Record<string, unknown>[];
          for (const row of rows) {
            const cols = Object.keys(row);
            const placeholders = cols.map(() => "?").join(",");
            newDb.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`).run(...Object.values(row));
            total++;
          }
        } else if (hasSessionId) {
          // session_logs / session_messages: filter by sessions.project_id via JOIN
          const rows = oldDb.prepare(
            `SELECT t.* FROM ${table} t JOIN sessions s ON s.id = t.session_id WHERE s.project_id = ?`
          ).all(proj.id) as Record<string, unknown>[];
          for (const row of rows) {
            const cols = Object.keys(row);
            const placeholders = cols.map(() => "?").join(",");
            newDb.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`).run(...Object.values(row));
            total++;
          }
        }
      }
    });
    tx();
    newDb.close();

    result.migrated[proj.id] = total;
    if (total > 0) anyWork = true;
  }

  oldDb.close();

  if (anyWork) {
    renameSync(opts.oldDbPath, opts.oldDbPath + ".legacy");
  }

  return result;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --test-name-pattern="migrateToPerProject"`
Expected: 2 pass.

- [ ] **Step 5: Add a CLI wrapper**

Append to `scripts/migrate-to-per-project.ts`:

```ts
// CLI entry: `npx tsx scripts/migrate-to-per-project.ts`
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const cfgPath = join(process.cwd(), "devlog.config.json");
  if (!existsSync(cfgPath)) {
    console.error("devlog.config.json not found in cwd");
    process.exit(1);
  }
  const cfg = JSON.parse(require("node:fs").readFileSync(cfgPath, "utf8")) as {
    projects: Array<{ id: string; path: string }>;
  };
  const oldDbPath = join(process.cwd(), "data", "devlog.db");
  const result = migrateToPerProject({ oldDbPath, projects: cfg.projects });
  console.log(JSON.stringify(result, null, 2));
}
```

- [ ] **Step 6: Commit + push**

```bash
git add scripts/migrate-to-per-project.ts src/core/__tests__/migrate.test.ts
git commit -m "feat: data migration script (single DB → per-project DBs)"
git push origin feat/per-project-storage
```

---

## Phase 10 — End-to-End Validation

### Task 10.1: Run full test suite

**Files:** none

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all tests pass (smoke + db-schema + db-schema-registry + db-pool + registry + migrate + lock-manager).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no NEW errors beyond Plan A's deferred kanban exhaustiveness.

- [ ] **Step 3: Note pass count + any remaining issues in commit message of next task (if any)**

### Task 10.2: Migrate the actual existing data

**Files:** none (manual)

- [ ] **Step 1: Backup current data**

```bash
cp /Users/moose/Moose/DevLog/data/devlog.db /Users/moose/Moose/DevLog/data/devlog.db.pre-migration-backup
```

- [ ] **Step 2: Stop main DevLog dev server if running** (worktree's dev server is fine — it has its own DB)

Use `lsof -nP -iTCP:3333 -sTCP:LISTEN` to find PID; `kill <pid>` if any. Don't kill the worktree's dev server.

- [ ] **Step 3: Run the migration**

```bash
cd /Users/moose/Moose/DevLog
npx tsx ~/.config/superpowers/worktrees/DevLog/feat-per-project-storage/scripts/migrate-to-per-project.ts
```

Expected output: `{ "migrated": { "videoclaw": 29 }, "skipped": [] }` (number depends on actual current row count).

- [ ] **Step 4: Verify migrated data**

```bash
sqlite3 /Users/moose/Moose/videoclaw/.devlog/devlog.db "SELECT COUNT(*), status FROM tasks GROUP BY status"
# Expected: matches the original 29 tasks (21 done / 3 in_progress / 5 todo)
```

- [ ] **Step 5: Verify legacy file**

```bash
ls -la /Users/moose/Moose/DevLog/data/devlog.db.legacy
# Expected: file exists at same byte size as the original
```

### Task 10.3: Register all known projects in registry

**Files:** none (manual)

- [ ] **Step 1: Use the new API in worktree's dev server**

```bash
# Start worktree dev server if not running
# (cd ~/.config/superpowers/worktrees/DevLog/feat-per-project-storage && npm run dev) &

# Sync from JSON config
curl -X POST http://localhost:3333/api/projects/scan \
  -H "Content-Type: application/json" \
  -d '{"rootPath":"/Users/moose/Moose"}'
# Expected: candidates including DevLog, videoclaw, easy-input

# Manually register devlog (since the goal is dogfooding):
curl -X POST http://localhost:3333/api/projects \
  -H "Content-Type: application/json" \
  -d '{"id":"devlog","name":"DevLog","path":"/Users/moose/Moose/DevLog","defaultBranch":"main"}'
```

- [ ] **Step 2: Verify registry**

```bash
sqlite3 ~/.config/devlog/registry.sqlite "SELECT id, name, path FROM projects"
# Expected: list including devlog and videoclaw
```

- [ ] **Step 3: Verify devlog has its own .devlog/ dir**

```bash
ls /Users/moose/Moose/DevLog/.devlog/
# Expected: devlog.db (empty schema-only file)
```

This sets up the dogfooding capability: the user can now insert DevLog dev tasks (Plan A T3.1+, Plan B, etc.) into `/Users/moose/Moose/DevLog/.devlog/devlog.db` and see them in the Kanban when the active project is `devlog`.

---

## Self-Review

**1. Spec coverage:**
- §2 file layout: ✅ Phase 3 (db-pool path resolution) + Phase 4 (registry creates .devlog/) + Phase 9 (migration moves data into per-project paths)
- §4.1 db-pool: ✅ Phase 3 (3 tasks)
- §4.2 registry: ✅ Phase 4 (CRUD) + Phase 5 (scan) + Phase 4.2 (sync helpers)
- §4.3 db.ts refactor: ✅ Phase 6
- §4.4 config.ts: ✅ Task 7.3 Step 2 + Task 6.1 Step 5
- §4.5 tests: ✅ test files in every phase
- §5 API: ✅ Phase 7 (project endpoints) + Phase 8 (retrofit)
- §6 migration: ✅ Phase 9 + Task 10.2
- §7 errors: ✅ covered inline in API tasks (400/404/409/500)
- §8 testing: ✅ unit + integration in Phase 9, manual in Phase 10
- §10 Plan A relationship: noted in plan header; refactor in Phase 6 keeps Plan A's modules untouched

**2. Placeholder scan:** No "TBD"/"implement later" left. Each step has actual code. The "throw new Error(not implemented yet)" stubs in Tasks 3.1, 4.1, 5.1 are tied to specific subsequent task numbers that resolve them — explicit forward references.

**3. Type consistency:**
- `DbPool` interface is defined in Task 3.1 and consumed unchanged in Tasks 3.2, 3.3, 4.1, 4.2, 7.x
- `ProjectRecord` / `ProjectCandidate` defined in Task 4.1 and used consistently in 4.2, 5.1, 7.x
- `getDb(projectId?)` signature settled in Task 6.1 and used by 8.x retrofits
- `Registry.create({ id, name, path, defaultBranch })` signature consistent across 4.1, 4.2, 7.1, 7.4

**4. Plan A coexistence:** This plan is independent of Plan A's remaining Phase 3-9. After both branches land, Plan A's Scheduler/Suspender/Sandbox can construct connections via `getDb(projectId)` instead of `getDb()` — single-line change at instantiation sites.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-per-project-storage.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, two-stage review (spec then quality), fast iteration; each task ends with a code commit pushed to `origin/feat/per-project-storage`.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints; same push rule.

**Which approach?**
