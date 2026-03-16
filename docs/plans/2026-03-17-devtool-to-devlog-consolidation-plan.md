# DevTool → DevLog Consolidation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the devtool web dashboard (`~/Moose/devtool/`) into the DevLog CLI repo (`~/Moose/DevLog/`), creating a unified product where CLI is the entry point and dashboard is a capability.

**Architecture:** Move existing CLI code to `src/cli/`, copy devtool's lib modules to `src/core/` (shared layer), bring dashboard's Next.js code into `src/app/` + `src/components/` + `src/hooks/`. Both CLI and dashboard import from `src/core/`. CLI builds with tsup, dashboard builds with Next.js.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Commander.js, better-sqlite3, tsup, shadcn/ui, Tailwind CSS 4

---

### Task 1: Create branch and restructure CLI code into src/cli/

**Files:**
- Move: `src/cli.ts` → `src/cli/cli.ts`
- Move: `src/index.ts` → `src/cli/index.ts`
- Move: `src/commands/*` → `src/cli/commands/*`
- Move: `src/utils/*` → `src/cli/utils/*`
- Keep: `src/core/` stays (will be merged in Task 2)

**Step 1: Create a new branch**

```bash
cd /Users/moose/Moose/DevLog
git checkout -b feat/devtool-consolidation
```

**Step 2: Create the src/cli/ directory structure**

```bash
cd /Users/moose/Moose/DevLog
mkdir -p src/cli/commands src/cli/utils
```

**Step 3: Move CLI files**

```bash
cd /Users/moose/Moose/DevLog
# Move CLI entry points
mv src/cli.ts src/cli/cli.ts
mv src/index.ts src/cli/index.ts

# Move commands
mv src/commands/* src/cli/commands/
rmdir src/commands

# Move CLI utils
mv src/utils/* src/cli/utils/
rmdir src/utils
```

**Step 4: Update import paths in src/cli/cli.ts**

All imports change from `./commands/...` to `./commands/...` (same relative path since cli.ts moved into cli/ alongside commands/).

Update the core imports from `./core/types.js` to `../core/types.js` (core stays at src/core/).

**Step 5: Update import paths in all command files**

Each command in `src/cli/commands/` that imports from `../core/` needs to change to `../../core/`.
Each command that imports from `../utils/` needs to change to `../utils/` (stays same, since utils moved into cli/ too).
Each command that imports from `./shared.js` stays the same.

**Step 6: Update tsup.config.ts entry point**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/cli.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

**Step 7: Verify CLI builds**

```bash
cd /Users/moose/Moose/DevLog
npx tsup
```

Expected: Build succeeds, `dist/cli.js` is produced.

**Step 8: Verify CLI runs**

```bash
cd /Users/moose/Moose/DevLog
node dist/cli.js --help
```

Expected: DevLog help text is printed.

**Step 9: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "refactor: move CLI code to src/cli/"
```

---

### Task 2: Create src/core/ shared layer (merge devtool lib + CLI core)

This task merges modules from two sources into `src/core/`:
- DevLog's existing `src/core/` (session discovery, parsing, pricing, config, cache, types)
- Devtool's `src/lib/` (db, schema, project-adapter, worktree-manager, process-manager, stream-manager, file-watcher, types)

**Files:**
- Keep: `src/core/cache.ts`, `config.ts`, `discovery.ts`, `fast-discovery.ts`, `parser.ts`, `pricing.ts`, `types.ts` (existing CLI core)
- Copy from devtool: `db.ts`, `db-schema.ts`, `worktree-manager.ts`, `process-manager.ts`, `stream-manager.ts`, `file-watcher.ts`, `utils.ts` → `src/core/`
- Copy from devtool: `project-adapter.ts` → `src/core/project-adapter.ts` (rename config refs)
- Copy from devtool: `types.ts` → `src/core/types-dashboard.ts` (separate to avoid conflict with CLI types.ts)

**Step 1: Copy devtool lib files to src/core/**

```bash
cd /Users/moose/Moose/DevLog

# Copy devtool server-side lib modules
cp /Users/moose/Moose/devtool/src/lib/db.ts src/core/db.ts
cp /Users/moose/Moose/devtool/src/lib/db-schema.ts src/core/db-schema.ts
cp /Users/moose/Moose/devtool/src/lib/worktree-manager.ts src/core/worktree-manager.ts
cp /Users/moose/Moose/devtool/src/lib/process-manager.ts src/core/process-manager.ts
cp /Users/moose/Moose/devtool/src/lib/stream-manager.ts src/core/stream-manager.ts
cp /Users/moose/Moose/devtool/src/lib/file-watcher.ts src/core/file-watcher.ts
cp /Users/moose/Moose/devtool/src/lib/utils.ts src/core/dashboard-utils.ts
cp /Users/moose/Moose/devtool/src/lib/project-adapter.ts src/core/project-adapter.ts
cp /Users/moose/Moose/devtool/src/lib/types.ts src/core/types-dashboard.ts
cp /Users/moose/Moose/devtool/src/lib/types-project.ts src/core/types-project.ts
```

**Step 2: Rename devtool → devlog in project-adapter.ts**

- Change `CONFIG_PATH` from `devtool.config.json` to `devlog.config.json`
- Rename type import: `DevtoolConfig` → `DevlogConfig`

```typescript
// src/core/project-adapter.ts
import type { DevlogConfig, ProjectConfig } from "./types-project";

const CONFIG_PATH = path.join(process.cwd(), "devlog.config.json");
```

**Step 3: Rename types in types-project.ts**

```typescript
// src/core/types-project.ts
export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
}

export interface DevlogConfig {
  projects: ProjectConfig[];
  activeProject: string;
  port: number;
}
```

**Step 4: Update imports in copied core files**

All files that import from `./types` need updating to `./types-dashboard` (for dashboard types) or `./types-project`.
All files that import from `./project-adapter`, `./db`, etc. stay as-is (same directory).

Replace all occurrences of `"devtool"` in display strings with `"devlog"`.

**Step 5: Update db.ts database path**

Change `./data/devtool.db` to `./data/devlog.db`:

```typescript
const DB_PATH = path.join(process.cwd(), "data", "devlog.db");
```

**Step 6: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "feat: create shared core layer with devtool modules"
```

---

### Task 3: Copy dashboard code (app, components, hooks)

**Files:**
- Copy: devtool `src/app/` → DevLog `src/app/`
- Copy: devtool `src/components/` → DevLog `src/components/`
- Copy: devtool `src/hooks/` → DevLog `src/hooks/`

**Step 1: Copy the directories**

```bash
cd /Users/moose/Moose/DevLog

# Copy dashboard source
cp -R /Users/moose/Moose/devtool/src/app src/app
cp -R /Users/moose/Moose/devtool/src/components src/components
cp -R /Users/moose/Moose/devtool/src/hooks src/hooks
```

**Step 2: Create src/lib/ for dashboard-specific utils**

```bash
mkdir -p src/lib
cp /Users/moose/Moose/devtool/src/lib/api-utils.ts src/lib/api-utils.ts
```

**Step 3: Copy Next.js config files**

```bash
cd /Users/moose/Moose/DevLog
cp /Users/moose/Moose/devtool/next.config.ts ./next.config.ts
cp /Users/moose/Moose/devtool/postcss.config.mjs ./postcss.config.mjs
cp /Users/moose/Moose/devtool/components.json ./components.json
cp /Users/moose/Moose/devtool/.npmrc ./.npmrc
```

**Step 4: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "feat: copy dashboard code from devtool"
```

---

### Task 4: Rewire dashboard imports from @/lib/ to @/core/

All dashboard code (app/, components/, hooks/) currently imports from `@/lib/...`. Most of these modules now live in `@/core/...`.

**Files:**
- Modify: all `src/app/api/*/route.ts` files
- Modify: all `src/components/**/*.tsx` files
- Modify: all `src/hooks/*.ts` files

**Step 1: Global find-and-replace imports**

Replace across all files in `src/app/`, `src/components/`, `src/hooks/`:

| Old import | New import |
|------------|-----------|
| `@/lib/db` | `@/core/db` |
| `@/lib/db-schema` | `@/core/db-schema` |
| `@/lib/types` | `@/core/types-dashboard` |
| `@/lib/types-project` | `@/core/types-project` |
| `@/lib/worktree-manager` | `@/core/worktree-manager` |
| `@/lib/process-manager` | `@/core/process-manager` |
| `@/lib/stream-manager` | `@/core/stream-manager` |
| `@/lib/file-watcher` | `@/core/file-watcher` |
| `@/lib/project-adapter` | `@/core/project-adapter` |
| `@/lib/utils` | `@/core/dashboard-utils` |
| `@/lib/devlog-client` | (remove — handled in Task 5) |
| `@/lib/api-utils` | `@/lib/api-utils` (stays in lib/) |

**Step 2: Rename DevtoolConfig → DevlogConfig in imports**

Search and replace `DevtoolConfig` with `DevlogConfig` across all files.

**Step 3: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "refactor: rewire dashboard imports from @/lib/ to @/core/"
```

---

### Task 5: Eliminate devlog-client.ts — direct core imports

The dashboard's devlog API route currently shells out to the external `devlog` CLI. Replace with direct imports from `src/core/`.

**Files:**
- Delete: `src/core/devlog-client.ts` (if copied) or skip if not copied
- Modify: `src/app/api/devlog/route.ts`
- Modify: `src/hooks/use-devlog.ts`

**Step 1: Do NOT copy devlog-client.ts (skip it if already copied)**

```bash
rm -f /Users/moose/Moose/DevLog/src/core/devlog-client.ts 2>/dev/null
rm -f /Users/moose/Moose/DevLog/src/lib/devlog-client.ts 2>/dev/null
```

**Step 2: Rewrite src/app/api/devlog/route.ts**

Replace the execFile-based implementation with direct core imports:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { discoverSessions } from "@/core/discovery";
import { computeStats, computeCost, computeToday } from "@/core/fast-discovery";

export async function GET(req: NextRequest) {
  const command = req.nextUrl.searchParams.get("command") ?? "stats";

  try {
    switch (command) {
      case "stats": {
        const stats = await computeStats();
        return NextResponse.json(stats);
      }
      case "cost": {
        const cost = await computeCost();
        return NextResponse.json(cost);
      }
      case "today": {
        const today = await computeToday();
        return NextResponse.json(today);
      }
      default:
        return NextResponse.json({ error: `Unknown command: ${command}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

Note: The exact function names depend on what the CLI core exports. The implementer should check `src/core/fast-discovery.ts` and `src/core/discovery.ts` for the actual exported functions and adapt.

**Step 3: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "refactor: replace devlog-client execFile with direct core imports"
```

---

### Task 6: Add devlog serve command

**Files:**
- Create: `src/cli/commands/serve.ts`
- Modify: `src/cli/cli.ts` (register serve command)

**Step 1: Create src/cli/commands/serve.ts**

```typescript
import { execFile, type ChildProcess } from "child_process";
import path from "path";
import chalk from "chalk";
import type { GlobalOptions } from "../../core/types.js";

export async function serveCommand(
  options: { port?: string },
  globalOpts: GlobalOptions
): Promise<void> {
  const port = options.port ?? "3333";
  const projectRoot = path.resolve(import.meta.dirname, "..", "..", "..");

  // Check if Next.js source exists (running from repo vs npm install)
  const nextConfigPath = path.join(projectRoot, "next.config.ts");
  const fs = await import("fs");
  if (!fs.existsSync(nextConfigPath)) {
    console.error(chalk.red("\n  Dashboard requires running from the DevLog source repo."));
    console.error(chalk.dim("  Clone https://github.com/moose-lab/DevLog and run from there.\n"));
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold.cyan("  ▌") + chalk.bold.white(" DevLog Dashboard"));
  console.log(chalk.dim(`  Starting on port ${port}...`));
  console.log();

  const child: ChildProcess = execFile(
    "npx",
    ["next", "dev", "--port", port],
    { cwd: projectRoot, stdio: "inherit" } as any
  );

  // Forward signals for clean shutdown
  const cleanup = () => {
    child.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Wait for child to exit
  await new Promise<void>((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Dashboard exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
```

**Step 2: Register serve command in src/cli/cli.ts**

Add to imports at top:

```typescript
import { serveCommand } from "./commands/serve.js";
```

Add to KNOWN_COMMANDS array:

```typescript
const KNOWN_COMMANDS = [
  "serve",
  "init",
  // ... rest
];
```

Add command registration after the default action block:

```typescript
// ── devlog serve ──────────────────────────────────────────
program
  .command("serve")
  .description("Start the DevLog dashboard")
  .option("-p, --port <port>", "Port number", "3333")
  .action(async (options) => {
    const globalOpts = getGlobalOpts();
    try {
      await serveCommand(options, globalOpts);
    } catch (err) {
      handleError(err, globalOpts);
    }
  });
```

**Step 3: Build and test**

```bash
cd /Users/moose/Moose/DevLog
npx tsup
node dist/cli.js serve --help
```

Expected: Shows serve command help with port option.

**Step 4: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "feat: add devlog serve command to launch dashboard"
```

---

### Task 7: Merge package.json and config files

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `devlog.config.json`

**Step 1: Merge package.json**

Combine dependencies from both projects. The merged package.json:

```json
{
  "name": "@moose-lab/devlog",
  "version": "0.5.0",
  "description": "Dev logs and dashboard for your Claude Code sessions",
  "type": "module",
  "bin": {
    "devlog": "./dist/cli.js"
  },
  "files": [
    "dist",
    "scripts"
  ],
  "scripts": {
    "dev": "next dev --port 3333",
    "build": "next build && tsup",
    "build:cli": "tsup",
    "build:web": "next build",
    "start": "next start --port 3333",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "claude",
    "devlog",
    "cli",
    "developer-tools",
    "dashboard"
  ],
  "author": "",
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@hello-pangea/dnd": "^17.0.0",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-tooltip": "^1.2.7",
    "anser": "^2.1.1",
    "better-sqlite3": "^11.8.1",
    "chalk": "^5.6.2",
    "chokidar": "^4.0.3",
    "class-variance-authority": "^0.7.1",
    "cli-table3": "^0.6.5",
    "clsx": "^2.1.1",
    "commander": "^14.0.3",
    "dayjs": "^1.11.19",
    "lucide-react": "^0.563.0",
    "next": "16.1.6",
    "node-pty": "^1.0.0",
    "ora": "^9.3.0",
    "radix-ui": "^1.4.3",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-markdown": "^10.1.0",
    "tailwind-merge": "^3.4.0",
    "toml": "^3.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "shadcn": "^3.8.4",
    "tailwindcss": "^4",
    "tsup": "^8.5.1",
    "tw-animate-css": "^1.4.0",
    "typescript": "^5"
  }
}
```

**Step 2: Update tsconfig.json**

Merge both configs — keep Next.js path alias `@/*`, support both CLI and dashboard:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ES2022",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "forceConsistentCasingInFileNames": true,
    "plugins": [
      { "name": "next" }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create devlog.config.json**

```json
{
  "projects": [
    {
      "id": "videoclaw",
      "name": "VideoClaw",
      "path": "/Users/moose/Moose/videoclaw",
      "defaultBranch": "main"
    }
  ],
  "activeProject": "videoclaw",
  "port": 3333
}
```

**Step 4: Install dependencies**

```bash
cd /Users/moose/Moose/DevLog
rm -rf node_modules package-lock.json pnpm-lock.yaml
npm install
```

Expected: Clean install succeeds.

**Step 5: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add package.json tsconfig.json devlog.config.json
git commit -m "feat: merge package.json, tsconfig, and devlog config"
```

---

### Task 8: Rename devtool → devlog in UI and display strings

**Files:**
- Modify: `src/app/layout.tsx` — title "DevTool" → "DevLog"
- Modify: any component that displays "DevTool" text
- Modify: `src/core/db.ts` — DB filename `devtool.db` → `devlog.db`

**Step 1: Update layout.tsx metadata**

Change title from `"DevTool"` to `"DevLog"` and description to `"Your Claude Code work journal — dashboard & CLI"`.

**Step 2: Search for remaining "devtool" strings**

```bash
cd /Users/moose/Moose/DevLog
grep -ri "devtool" src/ --include="*.ts" --include="*.tsx" -l
```

Replace all display-facing "DevTool" → "DevLog" and internal `devtool` → `devlog` references.

**Step 3: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "refactor: rename DevTool to DevLog throughout codebase"
```

---

### Task 9: Update .gitignore and cleanup

**Files:**
- Modify: `.gitignore`
- Delete: legacy files no longer needed (AUDIT.md, BEGINNER-AUDIT.md, OPTIMIZATION.md, pnpm-workspace.yaml, pnpm-lock.yaml)

**Step 1: Update .gitignore**

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
.DS_Store
```

**Step 2: Remove legacy DevLog-only files that are no longer relevant**

```bash
cd /Users/moose/Moose/DevLog
rm -f AUDIT.md BEGINNER-AUDIT.md OPTIMIZATION.md pnpm-workspace.yaml pnpm-lock.yaml
```

**Step 3: Copy BMAD from devtool if not present (local only, gitignored)**

```bash
cp -R /Users/moose/Moose/devtool/_bmad /Users/moose/Moose/DevLog/_bmad 2>/dev/null || true
cp -R /Users/moose/Moose/devtool/_bmad-output /Users/moose/Moose/DevLog/_bmad-output 2>/dev/null || true
```

**Step 4: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "chore: update .gitignore and remove legacy files"
```

---

### Task 10: Verify both builds

**Step 1: Build CLI**

```bash
cd /Users/moose/Moose/DevLog
npx tsup
```

Expected: `dist/cli.js` produced without errors.

**Step 2: Test CLI commands**

```bash
cd /Users/moose/Moose/DevLog
node dist/cli.js --help
node dist/cli.js stats
node dist/cli.js sessions -n 3
```

Expected: All commands produce output without errors.

**Step 3: Build dashboard**

```bash
cd /Users/moose/Moose/DevLog
npx next build
```

Expected: Build succeeds. There may be warnings about unused imports which should be fixed before committing.

**Step 4: Fix any build errors**

If Next.js build fails, fix import path issues. Common fixes:
- Missing `@/core/` modules → check if file was copied
- Type errors from merged types → adjust imports
- Missing UI components → check `src/components/ui/` was copied

**Step 5: Commit fixes**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "fix: resolve build errors from consolidation"
```

---

### Task 11: Smoke test — dashboard serve

**Step 1: Start dashboard**

```bash
cd /Users/moose/Moose/DevLog
npm run dev
```

Expected: Next.js starts on port 3333.

**Step 2: Verify endpoints**

```bash
curl -s http://localhost:3333/api/health
curl -s http://localhost:3333/api/projects | python3 -m json.tool
curl -s http://localhost:3333/api/tasks | python3 -m json.tool
curl -s http://localhost:3333/api/devlog?command=stats | python3 -m json.tool
```

Expected: All return valid JSON.

**Step 3: Verify CLI serve command**

```bash
cd /Users/moose/Moose/DevLog
npx tsup && node dist/cli.js serve --port 3334
```

Expected: Dashboard starts on port 3334.

**Step 4: Commit any fixes**

```bash
cd /Users/moose/Moose/DevLog
git add -A
git commit -m "fix: smoke test fixes"
```

(Only if fixes were needed.)

---

### Task 12: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update README to reflect the new unified product**

Key sections to update:
- Title and description → DevLog: CLI + Dashboard
- Quick start → `devlog serve` as primary usage
- Commands → add `devlog serve` to the list
- Project structure → new `src/cli/`, `src/core/`, `src/app/` layout
- Tech stack → add Next.js, React, better-sqlite3

**Step 2: Commit**

```bash
cd /Users/moose/Moose/DevLog
git add README.md
git commit -m "docs: update README for unified DevLog product"
```

---

## Execution Notes

- Tasks 1-3 are sequential (each restructures/copies files the next depends on)
- Task 4 depends on Tasks 2+3 (rewires imports between copied code)
- Task 5 depends on Task 4 (needs devlog-client.ts eliminated after rewiring)
- Task 6 can run after Task 1 (only touches CLI code)
- Task 7 depends on Tasks 3+4 (needs all source in place for npm install)
- Tasks 8-9 depend on Task 7 (need dependencies installed)
- Tasks 10-11 depend on all previous tasks
- Task 12 is independent, can run anytime after Task 10

## Source mapping

| Devtool source | → DevLog destination |
|----------------|---------------------|
| `devtool/src/lib/db.ts` | `src/core/db.ts` |
| `devtool/src/lib/db-schema.ts` | `src/core/db-schema.ts` |
| `devtool/src/lib/types.ts` | `src/core/types-dashboard.ts` |
| `devtool/src/lib/types-project.ts` | `src/core/types-project.ts` |
| `devtool/src/lib/project-adapter.ts` | `src/core/project-adapter.ts` |
| `devtool/src/lib/worktree-manager.ts` | `src/core/worktree-manager.ts` |
| `devtool/src/lib/process-manager.ts` | `src/core/process-manager.ts` |
| `devtool/src/lib/stream-manager.ts` | `src/core/stream-manager.ts` |
| `devtool/src/lib/file-watcher.ts` | `src/core/file-watcher.ts` |
| `devtool/src/lib/utils.ts` | `src/core/dashboard-utils.ts` |
| `devtool/src/lib/api-utils.ts` | `src/lib/api-utils.ts` |
| `devtool/src/lib/devlog-client.ts` | (eliminated) |
| `devtool/src/app/**` | `src/app/**` |
| `devtool/src/components/**` | `src/components/**` |
| `devtool/src/hooks/**` | `src/hooks/**` |
| `devtool/devtool.config.json` | `devlog.config.json` |
| DevLog `src/cli.ts` | `src/cli/cli.ts` |
| DevLog `src/commands/*` | `src/cli/commands/*` |
| DevLog `src/utils/*` | `src/cli/utils/*` |
| DevLog `src/core/*` | `src/core/*` (stays, merged) |
