# ADR 0001: One SQLite database, scoped by project_id

**Status:** Accepted (2026-06-12)
**Context:** REVIEW-2026-06-10 cross-cutting decision — "Consolidate the two
persistence layers before building more on either."

## Context

Two persistence designs coexisted:

1. **`src/core/db.ts`** — a process-wide singleton opening
   `${cwd}/data/devlog.db`, with every table carrying a `project_id` column
   and all queries scoped by it. Used by every API route, the process
   manager, task lifecycle, file watcher, and report store (18 importers).
2. **`src/core/db-pool.ts`** — a registry database
   (`~/.config/devlog/registry.sqlite`) plus one database per project at
   `<project>/.devlog/devlog.db`, with an LRU pool of open handles.
   Imported by nothing except its own tests.

Every new feature had to pick one, risking silent divergence: the pool
duplicated schema setup and migrations, and data written through one layer
was invisible to the other.

## Decision

The singleton with `project_id` scoping is the system of record. The pool
and its registry schema are deleted rather than migrated to:

- The whole application already runs on the singleton; the pool never
  acquired a production caller, so "migrating callers" reduces to removing
  the unused alternative.
- One database means one migration path (`rebuildTable` and the
  `migrate*` functions in `db.ts`), one backup artifact, and no
  cross-database consistency questions.
- Per-project database files would write `.devlog/` directories into
  users' repositories, which each repo would then need to gitignore.

## Consequences

- Multi-project isolation remains logical (`project_id` columns + scoped
  queries), not physical. If per-project portability is ever required,
  it needs a designed data migration — not a parallel layer.
- The data directory is anchored to the server's working directory
  (`${cwd}/data/`). That is a known wart, kept deliberately: changing it
  is a user-visible data migration and out of scope for this decision.
- `getProject(id)` in `src/core/project-adapter.ts` (config lookup) is
  unrelated to the deleted pool API of the same name.
