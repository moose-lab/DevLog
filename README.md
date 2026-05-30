# DevLog

**CLI + Dashboard for your Claude Code sessions.**

DevLog reads your Claude Code conversation history and turns it into structured, searchable work journals — with a web dashboard for visual exploration.

---

## Quick Start

```bash
# Install globally
npm install -g @moose-lab/devlog

# See your dashboard (CLI)
devlog

# Start the web dashboard
devlog serve

# What did I do today?
devlog today
```

---

## Commands

| Command | Description |
|---------|-------------|
| `devlog` | Quick terminal dashboard |
| `devlog serve` | Start the web dashboard (default port 3333) |
| `devlog today` | What did I do today? |
| `devlog sessions` | Browse all sessions by project |
| `devlog show <id>` | View a full conversation |
| `devlog search <query>` | Search sessions |
| `devlog stats` | Aggregated usage statistics |
| `devlog cost` | Cost, credits, and quota breakdown by project/provider |
| `devlog statusline` | Status line for Claude Code integration |
| `devlog setup-statusline` | Configure Claude Code status bar |
| `devlog setup-tmux` | Configure tmux cost dashboard |
| `devlog init` | Set up DevLog (usually auto-detected) |

**Common flags:** `--json` (JSON output), `-q` (quiet), `--no-color`

---

## Web Dashboard

Start with `devlog serve` or `bun run dev`:

- **Dashboard** — Overview of all projects and sessions
- **Tasks** — Kanban board for work items
- **Sessions** — Launch and monitor Claude Code sessions
- **Worktrees** — Git worktree management
- **Locks** — File conflict detection across worktrees
- **Reports** — Daily, weekly, and monthly work-output reports with HTML export
- **Cost & Usage** — CLI stats, costs, credits, and quotas in the browser

To get your daily summary, open `Analytics -> Reports`, select `Daily`, choose the date,
and click `Export HTML`. The dashboard downloads a standalone report named
`devlog-daily-report-YYYY-MM-DD.html`.

---

## Project Structure

```
DevLog/
├── src/
│   ├── cli/                     # CLI (Commander.js + tsup)
│   │   ├── cli.ts               # CLI entry point
│   │   ├── commands/            # Command implementations
│   │   └── utils/               # CLI formatting helpers
│   ├── core/                    # Shared layer (CLI + Dashboard)
│   │   ├── types.ts             # CLI types
│   │   ├── types-dashboard.ts   # Dashboard types
│   │   ├── discovery.ts         # Claude session discovery
│   │   ├── parser.ts            # JSONL parser
│   │   ├── db.ts                # SQLite database
│   │   ├── process-manager.ts   # Claude process management
│   │   └── ...                  # Config, cache, pricing, etc.
│   ├── app/                     # Next.js app router
│   │   ├── api/                 # API routes
│   │   └── */page.tsx           # Dashboard pages
│   ├── components/              # React components (shadcn/ui)
│   ├── hooks/                   # React hooks
│   └── lib/                     # Dashboard-specific utilities
├── tsup.config.ts               # CLI build config
├── next.config.ts               # Dashboard build config
├── devlog.config.json           # Project configuration
└── package.json
```

---

## Tech Stack

- **TypeScript** — Type-safe throughout
- **Commander.js** — CLI argument parsing
- **tsup** — Fast ESM bundling for CLI
- **Next.js 16** — Web dashboard framework
- **React 19** — UI components
- **better-sqlite3** — Local database for dashboard
- **shadcn/ui** — Component library
- **Tailwind CSS 4** — Styling
- **chalk** — Terminal colors

---

## Development

```bash
# Install dependencies
bun install

# Build CLI
bun run build:cli

# Build dashboard
bun run build:web

# Build both
bun run build

# Dev mode (dashboard with hot reload)
bun run dev

# Run tests
bun run test

# Run the pre-commit quality gate
bun run quality:precommit

# Run the full CI quality gate
bun run quality:ci

# Run CLI locally
bun dist/cli.js --help
```

`bun install` installs Husky hooks through the `prepare` script. The pre-commit
hook runs `bun run quality:precommit` to check staged whitespace, TypeScript, and
tests before code is committed. CI runs `bun run quality:ci`, which adds the
production dashboard and CLI builds.

---

## License

MIT
