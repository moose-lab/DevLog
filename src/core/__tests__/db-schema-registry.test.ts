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
