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
