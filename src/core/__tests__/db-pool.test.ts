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
