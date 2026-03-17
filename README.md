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
| `devlog cost` | Cost breakdown by project and model |
| `devlog statusline` | Status line for Claude Code integration |
| `devlog setup-statusline` | Configure Claude Code status bar |
| `devlog setup-tmux` | Configure tmux cost dashboard |
| `devlog init` | Set up DevLog (usually auto-detected) |

**Common flags:** `--json` (JSON output), `-q` (quiet), `--no-color`

---

## Web Dashboard

Start with `devlog serve` or `npm run dev`:

- **Dashboard** — Overview of all projects and sessions
- **Tasks** — Kanban board for work items
- **Sessions** — Launch and monitor Claude Code sessions
- **Worktrees** — Git worktree management
- **Locks** — File conflict detection across worktrees
- **DevLog** — CLI stats in the browser

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
npm install

# Build CLI
npm run build:cli

# Build dashboard
npm run build:web

# Build both
npm run build

# Dev mode (dashboard with hot reload)
npm run dev

# Run CLI locally
node dist/cli.js --help
```

---

## License

MIT
