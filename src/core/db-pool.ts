import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { REGISTRY_SCHEMA } from "./db-schema-registry";

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
