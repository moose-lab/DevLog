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
