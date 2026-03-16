# DevTool → DevLog Consolidation Design

**Date:** 2026-03-17
**Status:** Approved
**Approach:** In-place transformation of DevLog repo (Approach A)

## Summary

Consolidate the devtool web dashboard (`~/Moose/devtool/`) into the DevLog CLI repo (`~/Moose/DevLog/`). DevLog becomes a unified product: a CLI tool that can launch a web dashboard, with both CLI and dashboard sharing a common core module layer. The DevLog GitHub repo (`moose-lab/DevLog`) and npm package (`@moose-lab/devlog`) are preserved.

## Decisions

| Decision | Choice |
|----------|--------|
| Primary interface | CLI is the entry point; dashboard is a CLI capability |
| Typical usage | `devlog serve` → use dashboard for everything |
| CLI direct commands | Supplementary for power users / automation |
| Project structure | Dashboard (Next.js) as main project body, CLI integrated |
| Package name | `@moose-lab/devlog` (unchanged) |
| Multi-project support | Retained, `devtool.config.json` → `devlog.config.json` |
| BMAD | Local only, gitignored |
| Repo | `~/Moose/DevLog/` with existing git history |

## Architecture

```
User → CLI (devlog)
        ├── devlog serve        → starts Next.js dashboard (port 3333)
        ├── devlog stats        → direct CLI output
        ├── devlog sessions     → direct CLI output
        ├── devlog tasks ...    → direct CLI CRUD (future)
        └── devlog worktrees ...→ direct CLI CRUD (future)

Dashboard API routes ─┐
                      ├──→ src/core/ (shared modules)
CLI commands ─────────┘
```

CLI and dashboard are peers — both import from `src/core/`. Neither calls the other's API.

## Directory Structure

```
DevLog/
├── src/
│   ├── core/                     # Shared core (CLI + Dashboard both import)
│   │   ├── db.ts                 # SQLite database init (from devtool/lib/)
│   │   ├── db-schema.ts          # Schema with project_id (from devtool/lib/)
│   │   ├── types.ts              # Merged types (Task, Session, FileLock, DevLogEvent, etc.)
│   │   ├── project-adapter.ts    # Multi-project config (renamed from devtool)
│   │   ├── worktree-manager.ts   # Git worktree ops (from devtool/lib/)
│   │   ├── process-manager.ts    # Claude Code process mgmt (from devtool/lib/)
│   │   ├── stream-manager.ts     # Stream-json bidirectional (from devtool/lib/)
│   │   ├── file-watcher.ts       # File system monitoring (from devtool/lib/)
│   │   ├── session-discovery.ts  # Claude session scanning (from cli/core/discovery.ts)
│   │   ├── fast-discovery.ts     # Fast session scanning (from cli/core/fast-discovery.ts)
│   │   ├── session-parser.ts     # JSONL parser (from cli/core/parser.ts)
│   │   ├── pricing.ts            # Cost calculation (from cli/core/pricing.ts)
│   │   ├── cache.ts              # Cache layer (from cli/core/cache.ts)
│   │   ├── config.ts             # DevLog config mgmt (from cli/core/config.ts)
│   │   └── utils.ts              # Shared utilities
│   ├── cli/                      # CLI entry + commands
│   │   ├── cli.ts                # Commander.js entry point
│   │   ├── index.ts              # Core exports
│   │   ├── commands/
│   │   │   ├── serve.ts          # NEW: start dashboard server
│   │   │   ├── init.ts           # devlog init
│   │   │   ├── sessions.ts       # devlog sessions
│   │   │   ├── stats.ts          # devlog stats
│   │   │   ├── today.ts          # devlog today
│   │   │   ├── cost.ts           # devlog cost
│   │   │   ├── show.ts           # devlog show
│   │   │   ├── search.ts         # devlog search
│   │   │   ├── dashboard.ts      # devlog dashboard (legacy, alias to serve)
│   │   │   ├── statusline.ts     # devlog statusline
│   │   │   ├── setup-statusline.ts
│   │   │   ├── setup-tmux.ts
│   │   │   └── shared.ts         # Shared CLI helpers
│   │   └── utils/
│   │       ├── format.ts         # Terminal formatting
│   │       └── output.ts         # CLI output helpers
│   ├── app/                      # Next.js dashboard pages (from devtool/src/app/)
│   │   ├── api/
│   │   │   ├── devlog/route.ts   # Stats API (imports from core/, no execFile)
│   │   │   ├── projects/         # Project switcher API
│   │   │   ├── sessions/         # Session management API
│   │   │   ├── tasks/            # Kanban tasks API
│   │   │   ├── worktrees/        # Worktree API
│   │   │   ├── locks/            # File locks API
│   │   │   └── health/route.ts
│   │   ├── devlog/page.tsx
│   │   ├── sessions/page.tsx
│   │   ├── tasks/page.tsx
│   │   ├── worktrees/page.tsx
│   │   ├── locks/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx              # Dashboard home
│   ├── components/               # React components (from devtool/src/components/)
│   │   ├── layout/
│   │   ├── kanban/
│   │   ├── sessions/
│   │   ├── locks/
│   │   ├── worktrees/
│   │   └── ui/                   # shadcn/ui
│   ├── hooks/                    # React hooks (from devtool/src/hooks/)
│   └── lib/                      # Dashboard-specific utils (thin layer)
│       └── api-utils.ts          # resolveProjectId helper
├── scripts/                      # tmux/statusline scripts (existing DevLog)
├── dist/                         # CLI build output — tsup (gitignored)
├── data/                         # SQLite DB + logs (gitignored)
├── _bmad/                        # BMAD-METHOD (gitignored, local only)
├── _bmad-output/                 # BMAD output (gitignored, local only)
├── devlog.config.json            # Project registry
├── package.json                  # Unified: Next.js + CLI deps + bin entry
├── next.config.ts
├── tsup.config.ts                # CLI build: src/cli/cli.ts → dist/cli.js
├── tsconfig.json
├── components.json               # shadcn/ui config
├── postcss.config.mjs
└── .gitignore

## Build Strategy

Two build targets coexist:

| Build | Tool | Entry | Output |
|-------|------|-------|--------|
| CLI | tsup | `src/cli/cli.ts` | `dist/cli.js` |
| Dashboard | Next.js | `src/app/` | `.next/` |

```json
{
  "scripts": {
    "dev": "next dev --port 3333",
    "build": "next build && tsup",
    "build:cli": "tsup",
    "build:web": "next build",
    "start": "next start --port 3333"
  },
  "bin": {
    "devlog": "./dist/cli.js"
  }
}
```

## Key Transformations

### 1. devlog-client.ts elimination

**Before (devtool):** `execFile("devlog", ["stats", "--json"])` — shells out to external CLI
**After:** `import { getStats } from "@/core/session-discovery"` — direct in-process call

### 2. devlog serve command

New CLI command that starts the Next.js server:

```typescript
// src/cli/commands/serve.ts
import { execFile } from "child_process";

export function registerServeCommand(program: Command) {
  program
    .command("serve")
    .description("Start the DevLog dashboard")
    .option("-p, --port <port>", "Port number", "3333")
    .action(async (opts) => {
      const nextBin = require.resolve("next/dist/bin/next");
      const child = execFile("node", [nextBin, "dev", "--port", opts.port], {
        cwd: __dirname, // project root
        stdio: "inherit",
      });
      // ... handle signals
    });
}
```

### 3. Config rename

- `devtool.config.json` → `devlog.config.json`
- `DevtoolConfig` → `DevlogConfig`
- `types-project.ts` → merged into `src/core/types.ts`

### 4. Package.json merge

Combine dependencies from both:
- DevLog CLI deps: commander, chalk, cli-table3, dayjs, ora, toml
- Devtool dashboard deps: next, react, better-sqlite3, radix-ui, shadcn, etc.
- Unified devDependencies: typescript, tsup, tailwindcss, etc.

### 5. .gitignore

```gitignore
node_modules/
.next/
dist/
data/
*.db
*.db-shm
*.db-wal
_bmad/
_bmad-output/
```

## What Stays the Same

- DevLog GitHub remote (`moose-lab/DevLog`) and git history
- npm package name `@moose-lab/devlog`
- All existing CLI commands (stats, today, cost, sessions, etc.)
- All dashboard UI pages and functionality
- Kanban board, worktree management, session management, lock detection
- Multi-project support via config file
- shadcn/ui component library

## Migration Path

1. Restructure DevLog repo — move CLI code to `src/cli/`, create `src/core/`
2. Copy devtool dashboard code — `src/app/`, `src/components/`, `src/hooks/`, `src/lib/`
3. Merge dependencies — combine package.json, install
4. Rewire imports — dashboard imports from `@/core/` instead of `@/lib/`
5. Eliminate devlog-client.ts — replace execFile with direct imports
6. Add `devlog serve` command
7. Rename devtool → devlog throughout (config, types, UI titles)
8. Update .gitignore, verify builds
9. Smoke test — CLI commands + dashboard serve
