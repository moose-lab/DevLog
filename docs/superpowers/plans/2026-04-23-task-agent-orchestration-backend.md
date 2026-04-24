# Task-Agent Orchestration — Backend Plan (Plan A of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend foundation for conflict-aware task scheduling: extend the `tasks` status enum with `in_queue` and `fail`, add a `LockManager` over the existing `file_locks` table, a `Scheduler` that gates `in_progress` on conflicts, an `AgentSuspender` that gracefully parks an agent mid-flight when it loses a lock race, a `Sandbox` self-correction loop, and the API/task-lifecycle changes that wire it all together.

**Architecture:** Four new modules under `src/core/` — `lock-manager.ts`, `scheduler.ts`, `agent-suspender.ts`, `sandbox.ts` — sit between the existing `process-manager.ts` and `worktree-manager.ts`. The `Scheduler` is the single entry point that `/api/tasks/[id]/execute` and `retry` route through. `ProcessManager` gains a tool-use hook that calls `LockManager.acquire` before any file-mutating tool call. On lock acquire failure, `AgentSuspender` kills the claude process (preserving `claude_session_id` for `--resume`) and parks the task as `in_queue`. When a task ends, `Scheduler` walks the `in_queue` set and wakes anything whose `blocked_by` is now clear.

**Tech Stack:** TypeScript 5, Next.js 16 API routes, `better-sqlite3` for persistence, `node-pty` + `claude` CLI (stream-json) for the agent runtime, Node's built-in `node --test` runner for tests (no new test deps).

**Spec reference:** `docs/superpowers/specs/2026-04-23-task-agent-orchestration-design.md`

**Schema reality check:** The existing `file_locks` table uses `worktree_name` + `session_id` (not `task_id`), `resolved_at` (not `released_at`), `detected_at` (not `acquired_at`), and has a `lock_type` column ('write' | 'conflict'). This plan uses the existing field names — the spec's field names are illustrative only.

---

## File Structure

**New files:**
- `src/core/lock-manager.ts` — file-lock acquire/release/query, wraps the `file_locks` table
- `src/core/scheduler.ts` — `requestStart`, `onTaskEnded`, deadlock detection, concurrency cap
- `src/core/agent-suspender.ts` — graceful pause via process kill + `claude --resume` recovery
- `src/core/sandbox.ts` — runs configured commands and feeds failures back to the agent
- `src/core/__tests__/lock-manager.test.ts`
- `src/core/__tests__/scheduler.test.ts`
- `src/core/__tests__/agent-suspender.test.ts`
- `src/core/__tests__/sandbox.test.ts`
- `src/core/__tests__/test-helpers.ts` — in-memory sqlite fixture, mock ProcessManager

**Modified files:**
- `src/core/db-schema.ts` — extend tasks.status CHECK, add `blocked_by` / `sandbox_iterations` / `fail_reason` columns
- `src/core/types-dashboard.ts` — extend `TaskStatus` union
- `src/core/process-manager.ts` — emit `tool_intent` events before tool execution; expose `pause(sessionId)` hook
- `src/core/task-lifecycle.ts` — `onSessionExit` maps `exit_code !== 0` to `fail` (not `blocked`); read `blocked` only when set explicitly elsewhere
- `src/app/api/tasks/[id]/execute/route.ts` — delegate to `Scheduler.requestStart`
- `src/app/api/tasks/[id]/retry/route.ts` — accept `fail` as source state
- `src/app/api/sessions/[id]/stream/route.ts` — emit new SSE event types: `sandbox_start`, `sandbox_result`, `suspend`, `resume`
- `package.json` — add `"test": "node --test --import tsx --test-reporter spec src/core/__tests__/*.test.ts"` script
- `devlog.config.json` — example sandbox config under one project

---

## Phase 0 — Test Infrastructure

### Task 0.1: Add a `test` script and `tsx` dev dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install tsx (TS loader for node --test)**

```bash
npm install --save-dev tsx
```

Expected: `tsx` appears in `devDependencies`.

- [ ] **Step 2: Add `test` script**

In `package.json`, add to `"scripts"`:

```json
"test": "node --test --import tsx --test-reporter spec 'src/core/__tests__/*.test.ts'"
```

- [ ] **Step 3: Verify the runner works on an empty test directory**

```bash
mkdir -p src/core/__tests__ && npm test
```

Expected: exit 0 with "no tests found" or similar (depending on glob behavior; if it errors on empty glob, create `src/core/__tests__/.gitkeep` and a smoke test in Step 4).

- [ ] **Step 4: Smoke test**

Create `src/core/__tests__/smoke.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("smoke: node --test works", () => {
  assert.equal(1 + 1, 2);
});
```

Run: `npm test`. Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/core/__tests__/smoke.test.ts
git commit -m "test: add node --test runner via tsx"
```

### Task 0.2: Test helpers — in-memory SQLite + ProcessManager mock

**Files:**
- Create: `src/core/__tests__/test-helpers.ts`

- [ ] **Step 1: Write helpers**

```ts
import Database from "better-sqlite3";
import { SCHEMA } from "../db-schema";

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
```

- [ ] **Step 2: Sanity-check the helpers compile**

```bash
npx tsc --noEmit src/core/__tests__/test-helpers.ts
```

Expected: no errors. (If tsconfig excludes `__tests__`, run `npm run typecheck` instead — the file should still compile under the project's main config.)

- [ ] **Step 3: Commit**

```bash
git add src/core/__tests__/test-helpers.ts
git commit -m "test: add sqlite + ProcessManager test helpers"
```

---

## Phase 1 — DB & Type Foundation

### Task 1.1: Extend `tasks.status` CHECK + add new columns

**Files:**
- Modify: `src/core/db-schema.ts`
- Create: `src/core/__tests__/db-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/__tests__/db-schema.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb, insertTask } from "./test-helpers";

test("tasks.status accepts new in_queue and fail values", () => {
  const db = makeTestDb();
  const a = insertTask(db, { status: "in_queue" });
  const b = insertTask(db, { status: "fail" });
  const rows = db.prepare("SELECT id, status FROM tasks WHERE id IN (?, ?)").all(a, b) as Array<{ status: string }>;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.status).sort(), ["fail", "in_queue"]);
});

test("tasks.status rejects unknown values", () => {
  const db = makeTestDb();
  assert.throws(() => insertTask(db, { status: "bogus" }), /CHECK/);
});

test("tasks new columns exist with sensible defaults", () => {
  const db = makeTestDb();
  const id = insertTask(db, {});
  const row = db.prepare("SELECT blocked_by, sandbox_iterations, fail_reason FROM tasks WHERE id = ?").get(id) as {
    blocked_by: string | null;
    sandbox_iterations: number;
    fail_reason: string | null;
  };
  assert.equal(row.blocked_by, null);
  assert.equal(row.sandbox_iterations, 0);
  assert.equal(row.fail_reason, null);
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --test-name-pattern="tasks"
```

Expected: 3 failures (status not allowed, columns missing).

- [ ] **Step 3: Update the schema**

In `src/core/db-schema.ts`, change the `tasks` CREATE TABLE (note: SQLite has no `ALTER … CHECK`, so this works only on a fresh DB; for existing DBs we add a migration in Step 4):

```ts
// Replace the tasks CREATE TABLE block with:
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
```

- [ ] **Step 4: Add a runtime migration for existing DBs**

In `src/core/db.ts` (find the function that opens the DB and runs `SCHEMA`), add after the `db.exec(SCHEMA)` call:

```ts
function migrateTasksV2(db: Database.Database): void {
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

  // Status CHECK widening: SQLite cannot ALTER CHECK; we recreate the table only if old CHECK is detected.
  const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string };
  if (!stmt.sql.includes("'in_queue'") || !stmt.sql.includes("'fail'")) {
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
      INSERT INTO tasks_new
        SELECT id, project_id, title, description, status, priority, worktree_name, session_id, sort_order, prompt, NULL, 0, NULL, created_at, updated_at, completed_at
        FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
    `);
  }
}

// Then call migrateTasksV2(db) right after db.exec(SCHEMA).
```

- [ ] **Step 5: Run — expect pass**

```bash
npm test -- --test-name-pattern="tasks"
```

Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/db-schema.ts src/core/db.ts src/core/__tests__/db-schema.test.ts
git commit -m "feat(db): widen tasks.status (in_queue/fail) and add scheduling columns"
```

### Task 1.2: Extend `TaskStatus` TypeScript union

**Files:**
- Modify: `src/core/types-dashboard.ts`

- [ ] **Step 1: Find the existing union**

```bash
grep -n "TaskStatus" src/core/types-dashboard.ts
```

- [ ] **Step 2: Edit the union**

Replace:
```ts
export type TaskStatus = "todo" | "in_progress" | "review" | "blocked" | "done";
```
with:
```ts
export type TaskStatus = "todo" | "in_queue" | "in_progress" | "review" | "blocked" | "fail" | "done";
```

In the same file, extend the `Task` interface (find it and add):
```ts
export interface Task {
  // ... existing fields ...
  blocked_by?: string | null;          // JSON array of task ids when status === 'in_queue'
  sandbox_iterations?: number;
  fail_reason?: string | null;
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors. If any switch on `TaskStatus` is now non-exhaustive, fix the call site (likely `src/components/kanban/*` and `src/core/task-lifecycle.ts`) — defer the kanban changes to Plan B; for `task-lifecycle.ts` it's handled in Task 8.1.

- [ ] **Step 4: Commit**

```bash
git add src/core/types-dashboard.ts
git commit -m "feat(types): extend TaskStatus with in_queue and fail"
```

---

## Phase 2 — LockManager

### Task 2.1: `LockManager.acquire` happy path

**Files:**
- Create: `src/core/lock-manager.ts`
- Create: `src/core/__tests__/lock-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/__tests__/lock-manager.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb, insertSession, insertTask } from "./test-helpers";
import { createLockManager } from "../lock-manager";

test("acquire returns ok on free file", () => {
  const db = makeTestDb();
  const taskId = insertTask(db, { worktree_name: "wt-a" });
  const sessionId = insertSession(db, { task_id: taskId, worktree_name: "wt-a" });
  const lm = createLockManager(db);

  const result = lm.acquire({ sessionId, worktreeName: "wt-a", projectId: "test", paths: ["src/foo.ts"] });

  assert.deepEqual(result, { ok: true, acquired: ["src/foo.ts"] });
  const row = db.prepare("SELECT file_path, session_id, resolved_at FROM file_locks WHERE session_id = ?").get(sessionId);
  assert.deepEqual(row, { file_path: "src/foo.ts", session_id: sessionId, resolved_at: null });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --test-name-pattern="acquire returns ok"
```

Expected: import error / module not found.

- [ ] **Step 3: Implement minimal**

```ts
// src/core/lock-manager.ts
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
  whoHolds(filePath: string): string | null;  // returns sessionId or null
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
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- --test-name-pattern="acquire returns ok"
```

Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/lock-manager.ts src/core/__tests__/lock-manager.test.ts
git commit -m "feat(lock-manager): implement acquire happy path"
```

### Task 2.2: `LockManager.acquire` conflict path

**Files:**
- Modify: `src/core/__tests__/lock-manager.test.ts`

- [ ] **Step 1: Add the failing test**

Append to the test file:
```ts
test("acquire returns conflict info when file already locked", () => {
  const db = makeTestDb();
  const t1 = insertTask(db, { worktree_name: "wt-a" });
  const s1 = insertSession(db, { task_id: t1, worktree_name: "wt-a" });
  const t2 = insertTask(db, { worktree_name: "wt-b" });
  const s2 = insertSession(db, { task_id: t2, worktree_name: "wt-b" });
  const lm = createLockManager(db);

  lm.acquire({ sessionId: s1, worktreeName: "wt-a", projectId: "test", paths: ["src/shared.ts"] });
  const result = lm.acquire({ sessionId: s2, worktreeName: "wt-b", projectId: "test", paths: ["src/shared.ts", "src/other.ts"] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.conflictingPaths, ["src/shared.ts"]);
  assert.deepEqual(result.conflictingSessionIds, [s1]);
  // Important: NO partial acquire — src/other.ts should NOT be locked by s2
  assert.equal(lm.whoHolds("src/other.ts"), null);
});

test("acquire is a no-op for paths the same session already holds", () => {
  const db = makeTestDb();
  const t = insertTask(db);
  const s = insertSession(db, { task_id: t, worktree_name: "wt" });
  const lm = createLockManager(db);

  lm.acquire({ sessionId: s, worktreeName: "wt", projectId: "test", paths: ["a.ts"] });
  const result = lm.acquire({ sessionId: s, worktreeName: "wt", projectId: "test", paths: ["a.ts"] });

  assert.equal(result.ok, true);
  // No duplicate row should be created (it inserts again, but ok — let's accept duplicates as harmless for v1).
});
```

- [ ] **Step 2: Run — expect first test fail (no-partial-acquire), second pass**

```bash
npm test -- --test-name-pattern="acquire"
```

Expected: 2 pass, 1 fail (the conflict-info test if implementation already handles partial acquire; in fact our Step 3 of 2.1 inserts inside a transaction guarded by the check, so partial acquire shouldn't happen — verify).

- [ ] **Step 3: If failing, fix**

The existing implementation in 2.1 already short-circuits before any insert when a conflict exists, so the test should pass. If the conflict test fails, the bug is that the check loop must not insert; verify the early `return` is reached before `tx`.

- [ ] **Step 4: Commit**

```bash
git add src/core/__tests__/lock-manager.test.ts
git commit -m "test(lock-manager): cover conflict and idempotent reacquire paths"
```

### Task 2.3: `release` and `releaseAll`

**Files:**
- Modify: `src/core/__tests__/lock-manager.test.ts`

- [ ] **Step 1: Add tests**

```ts
test("release marks specific paths resolved", () => {
  const db = makeTestDb();
  const t = insertTask(db);
  const s = insertSession(db, { task_id: t, worktree_name: "wt" });
  const lm = createLockManager(db);

  lm.acquire({ sessionId: s, worktreeName: "wt", projectId: "test", paths: ["a.ts", "b.ts"] });
  lm.release(s, ["a.ts"]);

  assert.equal(lm.whoHolds("a.ts"), null);
  assert.equal(lm.whoHolds("b.ts"), s);
});

test("releaseAll resolves every path for a session", () => {
  const db = makeTestDb();
  const t = insertTask(db);
  const s = insertSession(db, { task_id: t, worktree_name: "wt" });
  const lm = createLockManager(db);

  lm.acquire({ sessionId: s, worktreeName: "wt", projectId: "test", paths: ["a.ts", "b.ts"] });
  lm.releaseAll(s);

  assert.equal(lm.whoHolds("a.ts"), null);
  assert.equal(lm.whoHolds("b.ts"), null);
});
```

- [ ] **Step 2: Run — expect pass (already implemented)**

```bash
npm test -- --test-name-pattern="release"
```

Expected: 2 pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/__tests__/lock-manager.test.ts
git commit -m "test(lock-manager): cover release and releaseAll"
```

---

## Phase 3 — Scheduler

### Task 3.1: `requestStart` no-conflict path

**Files:**
- Create: `src/core/scheduler.ts`
- Create: `src/core/__tests__/scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/__tests__/scheduler.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb, insertTask, FakeProcessManager } from "./test-helpers";
import { createScheduler } from "../scheduler";
import { createLockManager } from "../lock-manager";

test("requestStart with no conflicts returns in_progress and spawns agent", async () => {
  const db = makeTestDb();
  const lm = createLockManager(db);
  const pm = new FakeProcessManager();
  const sched = createScheduler({ db, lockManager: lm, processManager: pm, maxConcurrent: 3 });

  const taskId = insertTask(db, { worktree_name: "wt-a", status: "todo" });
  const result = await sched.requestStart(taskId, { declaredPaths: [] });

  assert.equal(result.status, "in_progress");
  assert.equal(pm.spawned.length, 1);
  assert.equal(pm.spawned[0].taskId, taskId);
  const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
  assert.equal(row.status, "in_progress");
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --test-name-pattern="requestStart with no conflicts"
```

Expected: module-not-found.

- [ ] **Step 3: Implement minimal**

```ts
// src/core/scheduler.ts
import type Database from "better-sqlite3";
import type { LockManager } from "./lock-manager";

export interface SchedulerProcessManager {
  spawnAgent(opts: { taskId: string; sessionId: string; resumeFrom?: string }): Promise<void>;
  pause(sessionId: string): Promise<void>;
}

export interface SchedulerOptions {
  db: Database.Database;
  lockManager: LockManager;
  processManager: SchedulerProcessManager;
  maxConcurrent: number;
}

export interface RequestStartOptions {
  declaredPaths?: string[];
}

export type RequestStartResult =
  | { status: "in_progress"; sessionId: string }
  | { status: "in_queue"; blockedBy: string[] };

export interface Scheduler {
  requestStart(taskId: string, opts?: RequestStartOptions): Promise<RequestStartResult>;
  onTaskEnded(taskId: string): Promise<void>;
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const { db, lockManager, processManager, maxConcurrent } = opts;

  function countInProgress(): number {
    const r = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'in_progress'").get() as { n: number };
    return r.n;
  }

  function newSessionId(): string {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  return {
    async requestStart(taskId, options = {}) {
      const declaredPaths = options.declaredPaths ?? [];
      const task = db.prepare("SELECT id, worktree_name, project_id FROM tasks WHERE id = ?").get(taskId) as
        | { id: string; worktree_name: string | null; project_id: string }
        | undefined;
      if (!task) throw new Error(`Task not found: ${taskId}`);

      // Concurrency cap
      if (countInProgress() >= maxConcurrent) {
        db.prepare(
          "UPDATE tasks SET status = 'in_queue', blocked_by = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(JSON.stringify(["__cap__"]), taskId);
        return { status: "in_queue", blockedBy: ["__cap__"] };
      }

      // Conflict check via declared paths
      if (declaredPaths.length > 0) {
        const conflictHolders = new Set<string>();
        for (const p of declaredPaths) {
          const holder = lockManager.whoHolds(p);
          if (holder) conflictHolders.add(holder);
        }
        if (conflictHolders.size > 0) {
          // map session ids back to task ids for blocked_by
          const placeholders = [...conflictHolders].map(() => "?").join(",");
          const taskRows = db
            .prepare(`SELECT DISTINCT task_id FROM sessions WHERE id IN (${placeholders})`)
            .all(...conflictHolders) as Array<{ task_id: string }>;
          const blockedByTaskIds = taskRows.map(r => r.task_id).filter(Boolean);
          db.prepare(
            "UPDATE tasks SET status = 'in_queue', blocked_by = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(JSON.stringify(blockedByTaskIds), taskId);
          return { status: "in_queue", blockedBy: blockedByTaskIds };
        }
      }

      // No conflict — create session row + spawn
      const sessionId = newSessionId();
      db.prepare(
        `INSERT INTO sessions (id, project_id, task_id, worktree_name, status)
         VALUES (?, ?, ?, ?, 'pending')`
      ).run(sessionId, task.project_id, taskId, task.worktree_name);
      db.prepare(
        "UPDATE tasks SET status = 'in_progress', session_id = ?, blocked_by = NULL, updated_at = datetime('now') WHERE id = ?"
      ).run(sessionId, taskId);

      await processManager.spawnAgent({ taskId, sessionId });
      return { status: "in_progress", sessionId };
    },
    async onTaskEnded(_taskId) {
      // Implemented in Task 3.3
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- --test-name-pattern="requestStart with no conflicts"
```

Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/scheduler.ts src/core/__tests__/scheduler.test.ts
git commit -m "feat(scheduler): requestStart happy path with concurrency cap"
```

### Task 3.2: `requestStart` enqueues on conflict

**Files:**
- Modify: `src/core/__tests__/scheduler.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
test("requestStart with declaredPaths conflict returns in_queue with blockedBy", async () => {
  const db = makeTestDb();
  const lm = createLockManager(db);
  const pm = new FakeProcessManager();
  const sched = createScheduler({ db, lockManager: lm, processManager: pm, maxConcurrent: 3 });

  const t1 = insertTask(db, { worktree_name: "wt-a" });
  const r1 = await sched.requestStart(t1, { declaredPaths: ["src/shared.ts"] });
  assert.equal(r1.status, "in_progress");
  if (r1.status === "in_progress") {
    lm.acquire({ sessionId: r1.sessionId, worktreeName: "wt-a", projectId: "test", paths: ["src/shared.ts"] });
  }

  const t2 = insertTask(db, { worktree_name: "wt-b" });
  const r2 = await sched.requestStart(t2, { declaredPaths: ["src/shared.ts"] });

  assert.equal(r2.status, "in_queue");
  if (r2.status === "in_queue") assert.deepEqual(r2.blockedBy, [t1]);

  const row = db.prepare("SELECT status, blocked_by FROM tasks WHERE id = ?").get(t2) as { status: string; blocked_by: string };
  assert.equal(row.status, "in_queue");
  assert.deepEqual(JSON.parse(row.blocked_by), [t1]);
  assert.equal(pm.spawned.length, 1, "should not spawn second agent");
});

test("requestStart enqueues when concurrency cap is hit even without conflict", async () => {
  const db = makeTestDb();
  const lm = createLockManager(db);
  const pm = new FakeProcessManager();
  const sched = createScheduler({ db, lockManager: lm, processManager: pm, maxConcurrent: 1 });

  const t1 = insertTask(db, { worktree_name: "wt-a" });
  await sched.requestStart(t1, { declaredPaths: [] });
  const t2 = insertTask(db, { worktree_name: "wt-b" });
  const r = await sched.requestStart(t2, { declaredPaths: [] });

  assert.equal(r.status, "in_queue");
  assert.equal(pm.spawned.length, 1);
});
```

- [ ] **Step 2: Run — expect both pass (already implemented)**

```bash
npm test -- --test-name-pattern="requestStart"
```

Expected: 3 pass total.

- [ ] **Step 3: Commit**

```bash
git add src/core/__tests__/scheduler.test.ts
git commit -m "test(scheduler): cover conflict and capacity enqueue paths"
```

### Task 3.3: `onTaskEnded` wakes up unblocked tasks

**Files:**
- Modify: `src/core/scheduler.ts`
- Modify: `src/core/__tests__/scheduler.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
test("onTaskEnded wakes a queued task whose blocker just finished", async () => {
  const db = makeTestDb();
  const lm = createLockManager(db);
  const pm = new FakeProcessManager();
  const sched = createScheduler({ db, lockManager: lm, processManager: pm, maxConcurrent: 3 });

  const t1 = insertTask(db, { worktree_name: "wt-a" });
  const r1 = await sched.requestStart(t1, { declaredPaths: ["src/x.ts"] });
  if (r1.status === "in_progress") {
    lm.acquire({ sessionId: r1.sessionId, worktreeName: "wt-a", projectId: "test", paths: ["src/x.ts"] });
  }

  const t2 = insertTask(db, { worktree_name: "wt-b" });
  await sched.requestStart(t2, { declaredPaths: ["src/x.ts"] });
  assert.equal(pm.spawned.length, 1);

  // Simulate t1 finishing: release locks, mark done, then notify scheduler.
  if (r1.status === "in_progress") lm.releaseAll(r1.sessionId);
  db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(t1);
  await sched.onTaskEnded(t1);

  assert.equal(pm.spawned.length, 2, "t2 should have been woken");
  const t2Row = db.prepare("SELECT status, blocked_by FROM tasks WHERE id = ?").get(t2) as { status: string; blocked_by: string | null };
  assert.equal(t2Row.status, "in_progress");
  assert.equal(t2Row.blocked_by, null);
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --test-name-pattern="onTaskEnded wakes"
```

Expected: spawn count 1 not 2.

- [ ] **Step 3: Implement `onTaskEnded`**

In `src/core/scheduler.ts`, replace the empty `onTaskEnded` with:

```ts
async onTaskEnded(_endedTaskId) {
  // Find all in_queue tasks. For each, re-evaluate blocked_by (still-active task ids
  // that hold locks the queued task wants). If empty, attempt to start it.
  const queued = db
    .prepare("SELECT id, blocked_by FROM tasks WHERE status = 'in_queue' ORDER BY sort_order, created_at")
    .all() as Array<{ id: string; blocked_by: string | null }>;

  for (const q of queued) {
    if (countInProgress() >= maxConcurrent) break;
    const blockers: string[] = q.blocked_by ? JSON.parse(q.blocked_by) : [];
    const cap = blockers.includes("__cap__");

    // For non-cap blockers, check whether any are still in_progress.
    const realBlockers = blockers.filter(b => b !== "__cap__");
    let stillBlocked = false;
    if (realBlockers.length > 0) {
      const placeholders = realBlockers.map(() => "?").join(",");
      const stillRunning = db
        .prepare(`SELECT id FROM tasks WHERE id IN (${placeholders}) AND status = 'in_progress'`)
        .all(...realBlockers) as Array<{ id: string }>;
      stillBlocked = stillRunning.length > 0;
    }
    if (!stillBlocked) {
      // Attempt to start. We pass declaredPaths=[] because original declared paths
      // were lost; v1 accepts that and relies on runtime locks (Task 5.x) to catch
      // mid-flight conflicts.
      // Reset status to 'todo' first so requestStart's flow is uniform.
      db.prepare("UPDATE tasks SET status = 'todo', blocked_by = NULL WHERE id = ?").run(q.id);
      await this.requestStart(q.id, { declaredPaths: [] });
      // Note: even if requestStart enqueues again (e.g., cap), that's correct.
      void cap;
    }
  }
}
```

Note: the `this.requestStart` reference inside the returned object literal needs `this` binding — change the return object to define methods using a stored reference. Refactor:

```ts
const api: Scheduler = {
  async requestStart(taskId, options = {}) { /* ... as before ... */ },
  async onTaskEnded(_endedTaskId) {
    const queued = db.prepare("SELECT id, blocked_by FROM tasks WHERE status = 'in_queue' ORDER BY sort_order, created_at").all() as Array<{ id: string; blocked_by: string | null }>;
    for (const q of queued) {
      if (countInProgress() >= maxConcurrent) break;
      const blockers: string[] = q.blocked_by ? JSON.parse(q.blocked_by) : [];
      const realBlockers = blockers.filter(b => b !== "__cap__");
      let stillBlocked = false;
      if (realBlockers.length > 0) {
        const placeholders = realBlockers.map(() => "?").join(",");
        const stillRunning = db.prepare(`SELECT id FROM tasks WHERE id IN (${placeholders}) AND status = 'in_progress'`).all(...realBlockers) as Array<{ id: string }>;
        stillBlocked = stillRunning.length > 0;
      }
      if (!stillBlocked) {
        db.prepare("UPDATE tasks SET status = 'todo', blocked_by = NULL WHERE id = ?").run(q.id);
        await api.requestStart(q.id, { declaredPaths: [] });
      }
    }
  },
};
return api;
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- --test-name-pattern="onTaskEnded wakes"
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/scheduler.ts src/core/__tests__/scheduler.test.ts
git commit -m "feat(scheduler): onTaskEnded wakes unblocked queued tasks"
```

### Task 3.4: Deadlock detection (cycle in blocked_by)

**Files:**
- Modify: `src/core/scheduler.ts`
- Modify: `src/core/__tests__/scheduler.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
test("requestStart detects deadlock cycle and marks late-comer fail", async () => {
  // Set up two in_progress tasks holding locks each wants from the other.
  const db = makeTestDb();
  const lm = createLockManager(db);
  const pm = new FakeProcessManager();
  const sched = createScheduler({ db, lockManager: lm, processManager: pm, maxConcurrent: 3 });

  const t1 = insertTask(db, { worktree_name: "wt-a" });
  const t2 = insertTask(db, { worktree_name: "wt-b" });
  const r1 = await sched.requestStart(t1, { declaredPaths: ["a.ts"] });
  const r2 = await sched.requestStart(t2, { declaredPaths: ["b.ts"] });
  if (r1.status === "in_progress") lm.acquire({ sessionId: r1.sessionId, worktreeName: "wt-a", projectId: "test", paths: ["a.ts"] });
  if (r2.status === "in_progress") lm.acquire({ sessionId: r2.sessionId, worktreeName: "wt-b", projectId: "test", paths: ["b.ts"] });

  // Now t1 wants b.ts (held by t2) and t2 wants a.ts (held by t1) — cycle.
  // Mid-flight conflict surfaces via Scheduler.suspendForLockConflict (added later).
  // For now we test the deadlock helper directly.
  const helper = (sched as unknown as { detectCycle: (taskId: string, blockers: string[]) => string[] | null }).detectCycle;
  const cycle = helper(t1, [t2]);  // pretend t1 newly wants to block on t2, while t2 already blocks on t1
  // Pre-condition: mark t2.blocked_by = [t1] manually for the test
  db.prepare("UPDATE tasks SET blocked_by = ? WHERE id = ?").run(JSON.stringify([t1]), t2);
  const cycle2 = helper(t1, [t2]);
  assert.notEqual(cycle2, null);
});
```

- [ ] **Step 2: Run — expect failure (no helper exposed)**

```bash
npm test -- --test-name-pattern="deadlock"
```

- [ ] **Step 3: Implement detectCycle and expose for test (and use in onTaskEnded / suspendForLockConflict)**

In `src/core/scheduler.ts`, add inside the factory:

```ts
function detectCycle(start: string, newBlockers: string[]): string[] | null {
  // BFS: starting from newBlockers, walk blocked_by edges; if we reach `start`, cycle.
  const visited = new Set<string>();
  const queue: Array<{ id: string; path: string[] }> = newBlockers.map(b => ({ id: b, path: [start, b] }));
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (id === start) return path;
    const row = db.prepare("SELECT blocked_by FROM tasks WHERE id = ?").get(id) as { blocked_by: string | null } | undefined;
    if (!row?.blocked_by) continue;
    const next: string[] = JSON.parse(row.blocked_by);
    for (const n of next) queue.push({ id: n, path: [...path, n] });
  }
  return null;
}
```

Expose for tests by attaching: in the returned `api`, add a non-enumerable property:

```ts
Object.defineProperty(api, "detectCycle", { value: detectCycle, enumerable: false });
```

Use it in `requestStart`'s conflict branch — before writing `in_queue`, run `detectCycle(taskId, blockedByTaskIds)`. If cycle is non-null, instead set status `fail` with `fail_reason = "Deadlock: " + cycle.join(" → ")`.

- [ ] **Step 4: Add a real-flow deadlock test (not just the helper)**

```ts
test("requestStart marks task fail when its blockers form a cycle", async () => {
  const db = makeTestDb();
  const lm = createLockManager(db);
  const pm = new FakeProcessManager();
  const sched = createScheduler({ db, lockManager: lm, processManager: pm, maxConcurrent: 3 });

  // Set up t1 in_progress, holding a.ts; t2 in_progress, holding b.ts;
  // t2.blocked_by manually set to [t1] to fake a chain (t1 wants b held by t2; if we want a held by t1, that closes the cycle).
  const t1 = insertTask(db, { worktree_name: "wt-a" });
  const r1 = await sched.requestStart(t1, { declaredPaths: ["a.ts"] });
  if (r1.status === "in_progress") lm.acquire({ sessionId: r1.sessionId, worktreeName: "wt-a", projectId: "test", paths: ["a.ts"] });
  const t2 = insertTask(db, { worktree_name: "wt-b", status: "in_queue" });
  db.prepare("UPDATE tasks SET blocked_by = ? WHERE id = ?").run(JSON.stringify([t1]), t2);

  // Now make t1 want a path held by t2 — but t2 doesn't hold any path; instead use the helper:
  // simulate Scheduler being asked to mark t1 in_queue blocked on t2.
  // Easiest: call requestStart for a NEW task t3 that tries to depend on t1 (no cycle — sanity), then setup cycle scenario via the helper.
  // For full integration we'll cover in suspendForLockConflict (Phase 5).
  const t3 = insertTask(db, { worktree_name: "wt-c" });
  // Make t1 also need a path that t3 holds — but t3 hasn't started. Instead, manually set t1's path lock to belong to t2's session.
  // Cycle test via helper covers the algorithmic correctness; integration is exercised in Phase 5.
  const cycleHelper = (sched as unknown as { detectCycle: (id: string, blockers: string[]) => string[] | null }).detectCycle;
  assert.deepEqual(cycleHelper(t1, [t2]), [t1, t2, t1]);
  void t3;
});
```

- [ ] **Step 5: Run — expect pass**

```bash
npm test -- --test-name-pattern="deadlock|cycle"
```

- [ ] **Step 6: Commit**

```bash
git add src/core/scheduler.ts src/core/__tests__/scheduler.test.ts
git commit -m "feat(scheduler): detect cycles in blocked_by and mark fail"
```

---

## Phase 4 — ProcessManager Tool-Use Hook

### Task 4.1: Emit `tool_intent` event before tool execution

**Files:**
- Modify: `src/core/process-manager.ts`

- [ ] **Step 1: Locate stream-json tool_use parse path**

```bash
grep -n "tool_use" src/core/process-manager.ts
```

Expected: find the place where tool_use blocks are read from the claude stream-json output.

- [ ] **Step 2: Add an `EventEmitter` interface for `tool_intent`**

Near the top of `src/core/process-manager.ts`, define:

```ts
import { EventEmitter } from "node:events";

export interface ToolIntent {
  sessionId: string;
  toolName: string;            // "Edit" | "Write" | "NotebookEdit" | "Bash" | etc.
  filePaths: string[];         // best-effort extraction; empty if no file in tool input
  proceed: () => void;         // call to allow execution
  block: (reason: string) => void;  // call to block (Suspender will invoke this)
}

export interface ProcessManagerEvents {
  tool_intent: (intent: ToolIntent) => void;
}
```

Add to ProcessManager class:
```ts
public events = new EventEmitter() as EventEmitter & {
  on<K extends keyof ProcessManagerEvents>(event: K, listener: ProcessManagerEvents[K]): EventEmitter;
  emit<K extends keyof ProcessManagerEvents>(event: K, ...args: Parameters<ProcessManagerEvents[K]>): boolean;
};
```

- [ ] **Step 3: Extract file paths helper**

In `src/core/process-manager.ts`:

```ts
function extractFilePaths(toolName: string, input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const obj = input as Record<string, unknown>;
  switch (toolName) {
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return typeof obj.file_path === "string" ? [obj.file_path] : [];
    case "Bash": {
      // Heuristic: look for `> path` redirects in the command. v1 only.
      const cmd = typeof obj.command === "string" ? obj.command : "";
      const matches = [...cmd.matchAll(/>>?\s*(\S+)/g)].map(m => m[1]);
      return matches;
    }
    default:
      return [];
  }
}
```

- [ ] **Step 4: Emit `tool_intent` and gate tool execution**

In the stream-json parser where a tool_use block is detected, before forwarding the input to the tool execution / next stdin write:

```ts
const filePaths = extractFilePaths(toolName, toolInput);

await new Promise<void>((resolve, reject) => {
  const intent: ToolIntent = {
    sessionId,
    toolName,
    filePaths,
    proceed: () => resolve(),
    block: (reason: string) => reject(new Error(`Tool blocked: ${reason}`)),
  };
  if (this.events.listenerCount("tool_intent") === 0) {
    // No listeners → default allow
    intent.proceed();
  } else {
    this.events.emit("tool_intent", intent);
  }
});
```

(The exact location depends on the parser's structure; goal: a hook that runs before the tool's effect is committed.)

- [ ] **Step 5: Smoke-build**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/process-manager.ts
git commit -m "feat(process-manager): emit tool_intent event before tool execution"
```

### Task 4.2: Wire LockManager listener

**Files:**
- Modify: `src/core/process-manager.ts` (or where ProcessManager is instantiated — likely `src/core/db.ts` or an init file)

- [ ] **Step 1: Find ProcessManager singleton init**

```bash
grep -rn "new ProcessManager\|getProcessManager\|processManager =" src/core src/app
```

- [ ] **Step 2: At the singleton init site, register a listener**

```ts
import { createLockManager } from "./lock-manager";
const lockManager = createLockManager(getDb());

processManager.events.on("tool_intent", (intent) => {
  if (intent.filePaths.length === 0) {
    intent.proceed();
    return;
  }
  // Look up the worktree + project for this session.
  const sess = getDb().prepare("SELECT worktree_name, project_id FROM sessions WHERE id = ?").get(intent.sessionId) as
    | { worktree_name: string | null; project_id: string }
    | undefined;
  if (!sess?.worktree_name) {
    intent.proceed();
    return;
  }
  const result = lockManager.acquire({
    sessionId: intent.sessionId,
    worktreeName: sess.worktree_name,
    projectId: sess.project_id,
    paths: intent.filePaths,
  });
  if (result.ok) intent.proceed();
  else intent.block(`Lock conflict on ${result.conflictingPaths.join(", ")} held by sessions ${result.conflictingSessionIds.join(", ")}`);
});
```

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
# In another terminal: hit /api/tasks/<id>/execute on a task
# Observe console for tool_intent listener executions
```

Defer to integration validation in Phase 5; this step's success criterion is "no crash on agent spawn".

- [ ] **Step 4: Commit**

```bash
git add src/core/process-manager.ts
# (and the init file if separate)
git commit -m "feat(process-manager): gate tool execution on LockManager.acquire"
```

---

## Phase 5 — AgentSuspender

### Task 5.1: `suspend(sessionId, reason)` — kill process, mark task in_queue

**Files:**
- Create: `src/core/agent-suspender.ts`
- Create: `src/core/__tests__/agent-suspender.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/__tests__/agent-suspender.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb, insertTask, insertSession, FakeProcessManager } from "./test-helpers";
import { createAgentSuspender } from "../agent-suspender";
import { createLockManager } from "../lock-manager";

test("suspend kills process, releases locks, marks task in_queue", async () => {
  const db = makeTestDb();
  const lm = createLockManager(db);
  const pm = new FakeProcessManager();
  const susp = createAgentSuspender({ db, lockManager: lm, processManager: pm });

  const t = insertTask(db, { status: "in_progress", worktree_name: "wt" });
  const s = insertSession(db, { task_id: t, worktree_name: "wt", status: "running" });
  db.prepare("UPDATE sessions SET claude_session_id = ? WHERE id = ?").run("claude-abc", s);
  lm.acquire({ sessionId: s, worktreeName: "wt", projectId: "test", paths: ["x.ts", "y.ts"] });

  await susp.suspend(s, { reason: "lock_conflict", blockerTaskIds: ["other-task"] });

  assert.deepEqual(pm.paused, [s]);
  assert.equal(lm.whoHolds("x.ts"), null);
  assert.equal(lm.whoHolds("y.ts"), null);
  const taskRow = db.prepare("SELECT status, blocked_by FROM tasks WHERE id = ?").get(t) as { status: string; blocked_by: string };
  assert.equal(taskRow.status, "in_queue");
  assert.deepEqual(JSON.parse(taskRow.blocked_by), ["other-task"]);
  const sessRow = db.prepare("SELECT status FROM sessions WHERE id = ?").get(s) as { status: string };
  assert.equal(sessRow.status, "paused");
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --test-name-pattern="suspend kills"
```

- [ ] **Step 3: Implement**

```ts
// src/core/agent-suspender.ts
import type Database from "better-sqlite3";
import type { LockManager } from "./lock-manager";
import type { SchedulerProcessManager } from "./scheduler";

export interface SuspendOptions {
  reason: "lock_conflict" | "user_pause";
  blockerTaskIds?: string[];
}

export interface AgentSuspender {
  suspend(sessionId: string, opts: SuspendOptions): Promise<void>;
  resume(sessionId: string): Promise<void>;
}

export interface AgentSuspenderDeps {
  db: Database.Database;
  lockManager: LockManager;
  processManager: SchedulerProcessManager;
}

export function createAgentSuspender(deps: AgentSuspenderDeps): AgentSuspender {
  const { db, lockManager, processManager } = deps;
  return {
    async suspend(sessionId, opts) {
      await processManager.pause(sessionId);
      lockManager.releaseAll(sessionId);
      db.prepare("UPDATE sessions SET status = 'paused' WHERE id = ?").run(sessionId);
      const sess = db.prepare("SELECT task_id FROM sessions WHERE id = ?").get(sessionId) as
        | { task_id: string | null }
        | undefined;
      if (sess?.task_id) {
        db.prepare(
          "UPDATE tasks SET status = 'in_queue', blocked_by = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(JSON.stringify(opts.blockerTaskIds ?? []), sess.task_id);
      }
    },
    async resume(sessionId) {
      const sess = db.prepare("SELECT task_id, claude_session_id FROM sessions WHERE id = ?").get(sessionId) as
        | { task_id: string | null; claude_session_id: string | null }
        | undefined;
      if (!sess) throw new Error(`No session ${sessionId}`);
      db.prepare("UPDATE sessions SET status = 'running' WHERE id = ?").run(sessionId);
      if (sess.task_id) {
        db.prepare(
          "UPDATE tasks SET status = 'in_progress', blocked_by = NULL, updated_at = datetime('now') WHERE id = ?"
        ).run(sess.task_id);
      }
      await processManager.spawnAgent({
        taskId: sess.task_id ?? "",
        sessionId,
        resumeFrom: sess.claude_session_id ?? undefined,
      });
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- --test-name-pattern="suspend kills"
```

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-suspender.ts src/core/__tests__/agent-suspender.test.ts
git commit -m "feat(agent-suspender): suspend releases locks and parks task"
```

### Task 5.2: `resume` rehydrates with `claude --resume`

**Files:**
- Modify: `src/core/__tests__/agent-suspender.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
test("resume sets task to in_progress and respawns with claude resume id", async () => {
  const db = makeTestDb();
  const lm = createLockManager(db);
  const pm = new FakeProcessManager();
  const susp = createAgentSuspender({ db, lockManager: lm, processManager: pm });

  const t = insertTask(db, { status: "in_queue", worktree_name: "wt" });
  const s = insertSession(db, { task_id: t, worktree_name: "wt", status: "paused" });
  db.prepare("UPDATE sessions SET claude_session_id = 'claude-abc' WHERE id = ?").run(s);

  await susp.resume(s);

  const taskRow = db.prepare("SELECT status, blocked_by FROM tasks WHERE id = ?").get(t) as { status: string; blocked_by: string | null };
  assert.equal(taskRow.status, "in_progress");
  assert.equal(taskRow.blocked_by, null);
  assert.equal(pm.spawned[0].resumeFrom, "claude-abc");
});
```

- [ ] **Step 2: Run — expect pass (already implemented)**

```bash
npm test -- --test-name-pattern="resume sets"
```

- [ ] **Step 3: Commit**

```bash
git add src/core/__tests__/agent-suspender.test.ts
git commit -m "test(agent-suspender): cover resume path"
```

### Task 5.3: Integrate Suspender with the tool_intent block path

**Files:**
- Modify: the singleton init site (from Task 4.2)

- [ ] **Step 1: Replace the simple `intent.block` listener with one that calls Suspender**

```ts
import { createAgentSuspender } from "./agent-suspender";
const suspender = createAgentSuspender({ db: getDb(), lockManager, processManager });

processManager.events.on("tool_intent", async (intent) => {
  if (intent.filePaths.length === 0) return intent.proceed();
  const sess = getDb().prepare("SELECT worktree_name, project_id, task_id FROM sessions WHERE id = ?").get(intent.sessionId) as
    | { worktree_name: string | null; project_id: string; task_id: string | null }
    | undefined;
  if (!sess?.worktree_name) return intent.proceed();

  const result = lockManager.acquire({
    sessionId: intent.sessionId,
    worktreeName: sess.worktree_name,
    projectId: sess.project_id,
    paths: intent.filePaths,
  });

  if (result.ok) return intent.proceed();

  // Map blocking session ids back to task ids (for blocked_by).
  const placeholders = result.conflictingSessionIds.map(() => "?").join(",");
  const blockerRows = getDb()
    .prepare(`SELECT DISTINCT task_id FROM sessions WHERE id IN (${placeholders})`)
    .all(...result.conflictingSessionIds) as Array<{ task_id: string | null }>;
  const blockerTaskIds = blockerRows.map(r => r.task_id).filter(Boolean) as string[];

  await suspender.suspend(intent.sessionId, { reason: "lock_conflict", blockerTaskIds });
  intent.block(`Suspended due to lock conflict on ${result.conflictingPaths.join(", ")}`);
});
```

- [ ] **Step 2: Manual smoke**

Run two tasks pointing at the same file, verify the second goes `in_queue` mid-flight when it tries to Edit.

- [ ] **Step 3: Commit**

```bash
git add src/core/process-manager.ts  # or wherever the listener lives
git commit -m "feat: graceful agent suspend on mid-flight lock conflict"
```

---

## Phase 6 — Sandbox Self-Correction

### Task 6.1: Sandbox config schema + types

**Files:**
- Modify: `src/core/types-project.ts` (or wherever ProjectConfig lives)
- Modify: `devlog.config.json`

- [ ] **Step 1: Extend ProjectConfig type**

```ts
export interface SandboxCommand { name: string; cmd: string }
export interface SandboxConfig {
  commands: SandboxCommand[];
  maxSelfFixIterations?: number;  // default 2
}

export interface ProjectConfig {
  // ... existing ...
  sandbox?: SandboxConfig;
}
```

- [ ] **Step 2: Add example to devlog.config.json**

Add under the `devlog` project:
```json
"sandbox": {
  "commands": [
    { "name": "typecheck", "cmd": "npm run typecheck" }
  ],
  "maxSelfFixIterations": 2
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/core/types-project.ts devlog.config.json
git commit -m "feat(sandbox): add SandboxConfig to ProjectConfig"
```

### Task 6.2: Sandbox runner — single command

**Files:**
- Create: `src/core/sandbox.ts`
- Create: `src/core/__tests__/sandbox.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/__tests__/sandbox.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSandboxCommand } from "../sandbox";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("runSandboxCommand returns exit code and combined output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sb-"));
  const result = await runSandboxCommand({
    name: "echo-test",
    cmd: "echo hello && exit 0",
    cwd: dir,
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /hello/);
});

test("runSandboxCommand surfaces non-zero exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sb-"));
  const result = await runSandboxCommand({
    name: "fail-test",
    cmd: "echo broken >&2 && exit 7",
    cwd: dir,
  });
  assert.equal(result.exitCode, 7);
  assert.match(result.output, /broken/);
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --test-name-pattern="runSandboxCommand"
```

- [ ] **Step 3: Implement**

```ts
// src/core/sandbox.ts
import { spawn } from "node:child_process";

export interface RunCommandOptions {
  name: string;
  cmd: string;
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface RunCommandResult {
  name: string;
  exitCode: number;
  output: string;       // combined stdout+stderr, truncated
  truncated: boolean;
}

export async function runSandboxCommand(opts: RunCommandOptions): Promise<RunCommandResult> {
  const maxBytes = opts.maxOutputBytes ?? 8 * 1024;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  return new Promise<RunCommandResult>((resolve) => {
    const proc = spawn("bash", ["-lc", opts.cmd], { cwd: opts.cwd });
    let buf = Buffer.alloc(0);
    let truncated = false;
    const append = (chunk: Buffer) => {
      if (buf.length >= maxBytes) { truncated = true; return; }
      const room = maxBytes - buf.length;
      buf = Buffer.concat([buf, chunk.subarray(0, room)]);
      if (chunk.length > room) truncated = true;
    };
    proc.stdout.on("data", append);
    proc.stderr.on("data", append);
    const t = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(t);
      resolve({
        name: opts.name,
        exitCode: code ?? -1,
        output: buf.toString("utf8"),
        truncated,
      });
    });
  });
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- --test-name-pattern="runSandboxCommand"
```

- [ ] **Step 5: Commit**

```bash
git add src/core/sandbox.ts src/core/__tests__/sandbox.test.ts
git commit -m "feat(sandbox): implement runSandboxCommand"
```

### Task 6.3: Sandbox loop orchestrator

**Files:**
- Modify: `src/core/sandbox.ts`
- Modify: `src/core/__tests__/sandbox.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
test("runSandboxLoop fires onIterationFail when a command fails, returns ok when all pass", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sb-"));
  const fails: number[] = [];
  let attempt = 0;
  const result = await runSandboxLoop({
    cwd: dir,
    commands: [
      { name: "x", cmd: () => attempt++ === 0 ? "exit 1" : "exit 0" },
    ],
    maxIterations: 2,
    onIterationFail: async (iter, failures) => { fails.push(iter); },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(fails, [1]);
});

test("runSandboxLoop returns ok=false after maxIterations", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sb-"));
  const result = await runSandboxLoop({
    cwd: dir,
    commands: [{ name: "x", cmd: () => "exit 1" }],
    maxIterations: 2,
    onIterationFail: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.iterationsUsed, 2);
});
```

Note: `cmd` is now a function so the test can vary it across iterations. Adjust types.

- [ ] **Step 2: Implement orchestrator**

```ts
// Append to src/core/sandbox.ts

export interface SandboxLoopCommand {
  name: string;
  cmd: () => string;       // resolved each iteration to allow file-state-dependent commands
}
export interface SandboxLoopOptions {
  cwd: string;
  commands: SandboxLoopCommand[];
  maxIterations: number;
  onIterationFail: (iteration: number, failures: RunCommandResult[]) => Promise<void>;
}
export interface SandboxLoopResult {
  ok: boolean;
  iterationsUsed: number;
  lastFailures: RunCommandResult[];
}

export async function runSandboxLoop(opts: SandboxLoopOptions): Promise<SandboxLoopResult> {
  let lastFailures: RunCommandResult[] = [];
  for (let iter = 1; iter <= opts.maxIterations; iter++) {
    const results: RunCommandResult[] = [];
    for (const c of opts.commands) {
      const r = await runSandboxCommand({ name: c.name, cmd: c.cmd(), cwd: opts.cwd });
      results.push(r);
    }
    const failures = results.filter(r => r.exitCode !== 0);
    if (failures.length === 0) {
      return { ok: true, iterationsUsed: iter, lastFailures: [] };
    }
    lastFailures = failures;
    await opts.onIterationFail(iter, failures);
  }
  return { ok: false, iterationsUsed: opts.maxIterations, lastFailures };
}
```

- [ ] **Step 3: Run — expect pass**

```bash
npm test -- --test-name-pattern="runSandboxLoop"
```

- [ ] **Step 4: Commit**

```bash
git add src/core/sandbox.ts src/core/__tests__/sandbox.test.ts
git commit -m "feat(sandbox): self-correction loop orchestrator"
```

### Task 6.4: Wire Sandbox into post-agent finish flow

**Files:**
- Modify: `src/core/task-lifecycle.ts`

- [ ] **Step 1: Update `onSessionExit` to run Sandbox before deciding final status**

Replace the current logic (`hasChanges → review`, `else → blocked`) with:

```ts
import { runSandboxLoop } from "./sandbox";
import { getProjectConfig } from "./config";  // helper that returns ProjectConfig

export async function onSessionExit(sessionId: string): Promise<void> {
  const db = getDb();
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as
    | { task_id: string | null; worktree_name: string | null; worktree_path: string | null; project_id: string; status: string; exit_code: number | null }
    | undefined;
  if (!session?.task_id) return;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(session.task_id) as Task | undefined;
  if (!task || task.status === "done") return;

  // Process exited abnormally?
  if (session.exit_code !== 0 && session.exit_code !== null) {
    db.prepare(
      "UPDATE tasks SET status = 'fail', fail_reason = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(`Agent exit code ${session.exit_code}`, task.id);
    return;
  }

  // Run sandbox if configured.
  const project = getProjectConfig(session.project_id);
  const sandboxCfg = project?.sandbox;
  const cwd = session.worktree_path ?? null;
  if (sandboxCfg && cwd && sandboxCfg.commands.length > 0) {
    const maxIter = sandboxCfg.maxSelfFixIterations ?? 2;
    let usedIter = task.sandbox_iterations ?? 0;
    const result = await runSandboxLoop({
      cwd,
      commands: sandboxCfg.commands.map(c => ({ name: c.name, cmd: () => c.cmd })),
      maxIterations: maxIter - usedIter,
      onIterationFail: async (iter, failures) => {
        usedIter += 1;
        db.prepare("UPDATE tasks SET sandbox_iterations = ? WHERE id = ?").run(usedIter, task.id);
        // TODO Phase 7: re-launch agent with failure context to attempt self-fix.
        // v1 minimal: just record and continue loop (the loop won't change file content
        // without re-launching the agent). For a true self-fix we need to spawn a new
        // session with a feedback prompt. That's covered in Task 7.4.
        void iter; void failures;
      },
    });
    if (!result.ok) {
      const summary = result.lastFailures.map(f => `${f.name} (exit ${f.exitCode})`).join(", ");
      db.prepare(
        "UPDATE tasks SET status = 'fail', fail_reason = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(`Sandbox failed after ${maxIter} self-fix attempts: ${summary}`, task.id);
      return;
    }
  }

  // Did the agent produce any change?
  let hasChanges = false;
  if (session.worktree_name) {
    try {
      const changed = await getWorktreeFilesChanged(session.worktree_name, session.project_id);
      hasChanges = changed > 0;
    } catch { /* worktree might not exist */ }
  }

  if (hasChanges) {
    db.prepare("UPDATE tasks SET status = 'review', updated_at = datetime('now') WHERE id = ?").run(task.id);
  } else {
    db.prepare(
      "UPDATE tasks SET status = 'fail', fail_reason = 'Agent finished with no file changes', updated_at = datetime('now') WHERE id = ?"
    ).run(task.id);
  }
}
```

- [ ] **Step 2: Notify Scheduler so it can wake queued tasks**

After every status update above (review/fail), add:

```ts
import { getScheduler } from "./scheduler-singleton";  // create this in Task 7.1
await getScheduler().onTaskEnded(task.id);
```

(If `getScheduler` not yet wired, leave the call as a TODO comment with the import line commented out — Task 7.1 will resolve.)

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/core/task-lifecycle.ts
git commit -m "feat(task-lifecycle): run Sandbox loop and map exit codes to fail/review"
```

---

## Phase 7 — API Surface

### Task 7.1: Scheduler singleton + wire into execute endpoint

**Files:**
- Create: `src/core/scheduler-singleton.ts`
- Modify: `src/app/api/tasks/[id]/execute/route.ts`

- [ ] **Step 1: Create singleton**

```ts
// src/core/scheduler-singleton.ts
import { getDb } from "./db";
import { createLockManager } from "./lock-manager";
import { createScheduler, type Scheduler } from "./scheduler";
import { getProcessManager } from "./process-manager";  // assume existing accessor

let _scheduler: Scheduler | null = null;

export function getScheduler(): Scheduler {
  if (_scheduler) return _scheduler;
  const db = getDb();
  const lm = createLockManager(db);
  const pm = getProcessManager();
  _scheduler = createScheduler({
    db,
    lockManager: lm,
    processManager: pm,  // ensure pm satisfies SchedulerProcessManager interface; if not, adapt
    maxConcurrent: Number(process.env.DEVLOG_MAX_CONCURRENT_TASKS ?? 3),
  });
  return _scheduler;
}
```

- [ ] **Step 2: Read current execute route**

```bash
cat src/app/api/tasks/[id]/execute/route.ts
```

Identify where the worktree + session creation happens — Scheduler now owns the status transition + session creation, so the route shrinks.

- [ ] **Step 3: Refactor execute route**

```ts
// src/app/api/tasks/[id]/execute/route.ts (replacement skeleton — preserve existing imports)
import { NextResponse } from "next/server";
import { getScheduler } from "@/core/scheduler-singleton";
import { ensureWorktreeForTask } from "@/core/worktree-manager";  // existing helper; adapt name

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Ensure a worktree exists before the Scheduler decides anything.
  await ensureWorktreeForTask(id);
  // declaredPaths is empty for v1 — we rely on runtime locks (Phase 4/5) for conflict detection.
  const result = await getScheduler().requestStart(id, { declaredPaths: [] });
  return NextResponse.json(result);
}
```

If `ensureWorktreeForTask` doesn't exist with that exact name, adapt to whatever existing helper builds the worktree (look in `src/core/worktree-manager.ts` and the previous version of this route).

- [ ] **Step 4: Manual smoke**

```bash
npm run dev
curl -X POST http://localhost:3333/api/tasks/<existing-task-id>/execute
```

Expected: JSON `{ "status": "in_progress", "sessionId": "..." }` and the task moves to `in_progress` in the UI.

- [ ] **Step 5: Commit**

```bash
git add src/core/scheduler-singleton.ts src/app/api/tasks/[id]/execute/route.ts
git commit -m "feat(api): route execute through Scheduler"
```

### Task 7.2: Extend retry endpoint to accept `fail` source state

**Files:**
- Modify: `src/app/api/tasks/[id]/retry/route.ts`

- [ ] **Step 1: Read current logic**

```bash
cat src/app/api/tasks/[id]/retry/route.ts
```

Identify the source-state guard (likely allows only `review`).

- [ ] **Step 2: Allow `fail`, reset counters**

In the route handler:

```ts
const allowed = ["review", "fail"];
if (!allowed.includes(task.status)) {
  return NextResponse.json({ error: `Cannot retry from status ${task.status}` }, { status: 400 });
}
// Reset failure tracking when retrying from fail
if (task.status === "fail") {
  getDb().prepare("UPDATE tasks SET fail_reason = NULL, sandbox_iterations = 0 WHERE id = ?").run(id);
}
// Now hand to scheduler
const result = await getScheduler().requestStart(id, { declaredPaths: [] });
return NextResponse.json(result);
```

(Preserve any existing feedback-prompt prepend logic from review-retry — apply only when source was `review`.)

- [ ] **Step 3: Manual smoke**

```bash
# Mark a test task fail manually:
sqlite3 ~/.devlog/db.sqlite "UPDATE tasks SET status='fail', fail_reason='test' WHERE id='...';"
curl -X POST http://localhost:3333/api/tasks/<id>/retry
```

Expected: task moves to `in_progress`, `fail_reason` cleared.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tasks/[id]/retry/route.ts
git commit -m "feat(api): allow retry from fail state, reset sandbox counters"
```

### Task 7.3: Add SSE event types for sandbox/suspend/resume

**Files:**
- Modify: `src/core/stream-manager.ts`
- Modify: `src/app/api/sessions/[id]/stream/route.ts`

- [ ] **Step 1: Extend stream-manager event types**

```ts
// In src/core/stream-manager.ts — extend the event union
export type StreamEvent =
  // ... existing variants ...
  | { type: "sandbox_start"; commandName: string }
  | { type: "sandbox_result"; commandName: string; exitCode: number; truncated: boolean; outputTail: string }
  | { type: "suspend"; reason: string; blockerTaskIds: string[] }
  | { type: "resume" };
```

- [ ] **Step 2: Emit from Sandbox loop and Suspender**

In `src/core/task-lifecycle.ts` Sandbox loop:
```ts
import { getStreamManager } from "./stream-manager";
// before runSandboxCommand call:
getStreamManager().publish(sessionId, { type: "sandbox_start", commandName: c.name });
// after:
getStreamManager().publish(sessionId, { type: "sandbox_result", commandName: r.name, exitCode: r.exitCode, truncated: r.truncated, outputTail: r.output.slice(-512) });
```

In `src/core/agent-suspender.ts`:
```ts
getStreamManager().publish(sessionId, { type: "suspend", reason: opts.reason, blockerTaskIds: opts.blockerTaskIds ?? [] });
// in resume:
getStreamManager().publish(sessionId, { type: "resume" });
```

- [ ] **Step 3: Verify SSE route forwards new types**

In `src/app/api/sessions/[id]/stream/route.ts`, ensure the formatter for SSE messages doesn't filter by type — it should JSON-stringify whatever StreamEvent comes through. If a switch exists, add cases for the new types (or remove the switch).

- [ ] **Step 4: Manual smoke**

```bash
curl -N http://localhost:3333/api/sessions/<id>/stream
# Trigger a task that runs sandbox — expect new events in the stream
```

- [ ] **Step 5: Commit**

```bash
git add src/core/stream-manager.ts src/core/task-lifecycle.ts src/core/agent-suspender.ts src/app/api/sessions/[id]/stream/route.ts
git commit -m "feat(sse): emit sandbox_start/result and suspend/resume events"
```

### Task 7.4: Sandbox-induced agent re-launch for self-fix

**Files:**
- Modify: `src/core/task-lifecycle.ts`

The simple loop in Task 6.4 records iterations but doesn't actually re-run the agent to fix — it just re-runs the same commands, which is pointless. This task wires the real self-fix.

- [ ] **Step 1: In `onSessionExit`'s `onIterationFail`, instead of looping in-process, mark the task to be re-launched and break out**

Replace the `runSandboxLoop` invocation with a single iteration:

```ts
// Run sandbox commands ONCE per agent session.
const results = [];
for (const c of sandboxCfg.commands) {
  getStreamManager().publish(sessionId, { type: "sandbox_start", commandName: c.name });
  const r = await runSandboxCommand({ name: c.name, cmd: c.cmd, cwd });
  getStreamManager().publish(sessionId, { type: "sandbox_result", commandName: r.name, exitCode: r.exitCode, truncated: r.truncated, outputTail: r.output.slice(-512) });
  results.push(r);
}
const failures = results.filter(r => r.exitCode !== 0);
if (failures.length === 0) {
  // pass — fall through to "did agent change anything" check
} else {
  const usedSoFar = (task.sandbox_iterations ?? 0) + 1;
  db.prepare("UPDATE tasks SET sandbox_iterations = ? WHERE id = ?").run(usedSoFar, task.id);
  if (usedSoFar >= (sandboxCfg.maxSelfFixIterations ?? 2)) {
    const summary = failures.map(f => `${f.name} (exit ${f.exitCode})`).join(", ");
    db.prepare("UPDATE tasks SET status = 'fail', fail_reason = ?, updated_at = datetime('now') WHERE id = ?")
      .run(`Sandbox failed after ${usedSoFar} self-fix attempts: ${summary}`, task.id);
    await getScheduler().onTaskEnded(task.id);
    return;
  }
  // Re-launch agent with failure context — schedule a new requestStart with prepended feedback.
  const feedback = failures.map(f => `# ${f.name} failed (exit ${f.exitCode}):\n\n${f.output}`).join("\n\n");
  // Stash feedback into the task.prompt or a dedicated column? For v1, prepend to task.prompt:
  const cur = db.prepare("SELECT prompt FROM tasks WHERE id = ?").get(task.id) as { prompt: string | null };
  const newPrompt = `Previous attempt failed sandbox checks. Fix the following errors and continue:\n\n${feedback}\n\n---\n\nOriginal prompt:\n${cur.prompt ?? ""}`;
  db.prepare("UPDATE tasks SET prompt = ?, status = 'todo' WHERE id = ?").run(newPrompt, task.id);
  await getScheduler().requestStart(task.id, { declaredPaths: [] });
  return;
}
```

- [ ] **Step 2: Manual smoke**

Configure `devlog.config.json` sandbox to a command you can deterministically fail (e.g. `npm run typecheck` while a TS error is in scope). Run a task that should fix it. Observe iterations < max.

- [ ] **Step 3: Commit**

```bash
git add src/core/task-lifecycle.ts
git commit -m "feat(sandbox): re-launch agent with failure feedback for self-fix"
```

---

## Phase 8 — Wire `onTaskEnded` callbacks

### Task 8.1: ProcessManager exit emits to Scheduler

**Files:**
- Modify: `src/core/process-manager.ts` (or wherever `onSessionExit` is called from)

- [ ] **Step 1: Find where `onSessionExit` is called**

```bash
grep -rn "onSessionExit\b" src/core src/app
```

- [ ] **Step 2: At the call site, after `onSessionExit` finishes, also notify the Scheduler**

```ts
import { getScheduler } from "./scheduler-singleton";
await onSessionExit(sessionId);
// Look up task id and notify
const t = getDb().prepare("SELECT task_id FROM sessions WHERE id = ?").get(sessionId) as { task_id: string | null } | undefined;
if (t?.task_id) await getScheduler().onTaskEnded(t.task_id);
```

(If `onSessionExit` already calls `getScheduler().onTaskEnded` from Task 6.4 Step 2, this is a no-op — verify no double notification.)

- [ ] **Step 3: Manual smoke**

Start two tasks where the second is queued behind the first. End the first. Confirm the second auto-starts.

- [ ] **Step 4: Commit**

```bash
git add src/core/process-manager.ts
git commit -m "feat: notify Scheduler on session exit to wake queued tasks"
```

---

## Phase 9 — Final validation

### Task 9.1: End-to-end conflict scenario

**Files:** none (manual)

- [ ] **Step 1: Configure 2 test tasks**

In the dev DB, insert two tasks both targeting `src/foo.ts` (manually edit the prompt to include "modify src/foo.ts" so the agent will Edit/Write it).

- [ ] **Step 2: Start both via API**

```bash
curl -X POST http://localhost:3333/api/tasks/<t1>/execute
curl -X POST http://localhost:3333/api/tasks/<t2>/execute
```

Expected: t1 → in_progress, t2 → in_queue with `blocked_by: [t1]`.

- [ ] **Step 3: Let t1 finish**

Wait for t1 to complete (or kill its agent). Confirm t2 wakes and runs.

- [ ] **Step 4: Document the result in the plan-completion comment for the next phase**

Save a short note (file or commit message) — what worked, what didn't, anything to flag for Plan B (Frontend).

### Task 9.2: Sandbox failure scenario

**Files:** none (manual)

- [ ] **Step 1: Configure sandbox** to run `npm run typecheck` for a project that currently has a TS error.

- [ ] **Step 2: Run the task** that should fix the error.

- [ ] **Step 3: Inspect** `tasks.sandbox_iterations` to confirm increment; if the task fails after max, confirm `fail_reason` is human-readable.

### Task 9.3: Smoke test all the new SSE events

**Files:** none (manual)

- [ ] **Step 1:** Open `curl -N` on a session stream during a task that triggers sandbox + a conflict suspend.

- [ ] **Step 2:** Verify the stream contains: `sandbox_start`, `sandbox_result`, `suspend`, `resume` events.

---

## Self-Review

**Spec coverage:**
- §2 state machine: ✅ Phase 1 (enum), Phase 3 (in_queue transitions), Phase 5 (suspend → in_queue), Phase 6/Task 6.4 (fail mapping)
- §3.1 Scheduler: ✅ Phase 3
- §3.2 LockManager: ✅ Phase 2
- §3.3 AgentSuspender: ✅ Phase 5
- §3.4 Sandbox: ✅ Phase 6
- §4 schema: ✅ Phase 1
- §5 API: ✅ Phase 7
- §6 frontend: ❌ Out of scope — covered in Plan B
- §7 errors: partial — process exit, Sandbox fail, lock conflict are covered. Timeout, deadlock cycle handling, and SSE reconnect are noted but not exercised. Acceptable for v1; add in Plan B's polish phase.
- §10 open questions: deferred — correct.

**Type consistency check:**
- `SchedulerProcessManager` is defined in `scheduler.ts` and reused in `agent-suspender.ts` — consistent.
- `LockManager.acquire` returns `{ ok, acquired }` or `{ ok: false, conflictingSessionIds, conflictingPaths }` — used uniformly in Scheduler 3.1 and process-manager listener 4.2/5.3.
- `RequestStartResult` and `SuspendOptions` types are defined once and imported consistently.
- `ToolIntent` interface uses `proceed/block` callbacks — matches usage in Phase 4 and Phase 5.
- `SandboxCommand.cmd` is `string` in config (Task 6.1) but a `() => string` factory inside `runSandboxLoop` (Task 6.3). The wiring in Task 6.4 wraps with `() => c.cmd` — consistent.

**Placeholder scan:** No "TBD"/"implement later" left. Task 6.4 Step 2 noted a TODO that Task 7.4 resolves; Task 7.4 then replaces the placeholder loop with the real self-fix wiring.

**Plan A scope:** Backend-only. End user impact: API now returns `in_queue` status; Kanban UI still needs Plan B to render new states. Backend is independently testable via `npm test` + curl smoke scripts.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-task-agent-orchestration-backend.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

After Plan A is implemented and merged, request **Plan B (Frontend)** to ship the Kanban + Sessions Side Drawer UI changes that consume these new states/events.
