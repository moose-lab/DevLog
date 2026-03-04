# DevLog

**Auto-generate dev logs from your Claude Code sessions.**

DevLog reads your Claude Code conversation history and turns it into structured, searchable work journals. No more forgetting what you built yesterday.

---

## Quick Start

```bash
# Install (or clone and build)
npm install -g @anthropic/devlog

# Initialize — detects Claude Code and scans your sessions
devlog init

# View your session history
devlog sessions
```

That's it. Three commands, under 2 minutes.

---

## Commands

### `devlog init`

Detects your Claude Code installation, scans `~/.claude/projects/`, and creates the DevLog config at `~/.devlog/config.toml`.

```
$ devlog init

DevLog Init
─────────────────────
✓ Found Claude Code at ~/.claude/projects
✓ Created DevLog config at ~/.devlog
ℹ Scanning your Claude Code sessions...

  ┌─────────────────────────────────────────┐
  │  Projects         3                     │
  │  Sessions         5                     │
  │  Messages        34                     │
  └─────────────────────────────────────────┘

✓ DevLog initialized successfully!
```

### `devlog sessions`

Lists all your Claude Code projects and sessions, sorted by most recent activity.

```
$ devlog sessions

Claude Code Sessions
──────────────────────────────
  3 projects · 5 sessions · 34 messages

  📁 chatbot (2 sessions)
     /home/ubuntu/projects/ai/chatbot

   TIME            MSGS  FIRST MESSAGE                          SESSION ID
   2 hours ago     4     Add a FastAPI server to expose the…    52fb6788-1b1d-48…
   8 hours ago     8     I want to build a RAG chatbot using…   f7908a46-6f38-4a…
```

**Options:**

| Flag | Description |
|------|-------------|
| `-p, --project <name>` | Filter sessions by project name |
| `-n, --limit <number>` | Max sessions to display (default: 20) |
| `-a, --all` | Show all sessions |

---

## Project Structure

```
devlog/
├── src/
│   ├── cli.ts                 # CLI entry point (Commander.js)
│   ├── commands/
│   │   ├── init.ts            # devlog init
│   │   └── sessions.ts        # devlog sessions
│   ├── core/
│   │   ├── types.ts           # DevLogEvent, Session, Project types
│   │   ├── config.ts          # Config management (TOML)
│   │   ├── discovery.ts       # Claude Code log discovery
│   │   └── parser.ts          # JSONL streaming parser
│   └── utils/
│       ├── paths.ts           # Path encoding/decoding
│       └── format.ts          # Terminal formatting helpers
├── tsup.config.ts             # Build config
├── tsconfig.json
└── package.json
```

---

## How It Works

1. **Discovery** — Scans `~/.claude/projects/` for project directories. Each directory name is an encoded path (e.g., `-Users-dong-projects-myapp` → `/Users/dong/projects/myapp`).

2. **Parsing** — Reads `.jsonl` session files using streaming (handles large files). Each line is a JSON event with types: `human`, `assistant`, `tool_use`, `tool_result`, `summary`.

3. **Display** — Renders sessions in a clean terminal table with project grouping, message counts, timestamps, and first-message previews.

---

## Configuration

Config lives at `~/.devlog/config.toml`:

```toml
[paths]
claude_dir = "~/.claude/projects"
devlog_dir = "~/.devlog"

[display]
max_sessions = 50
preview_length = 80
```

---

## Roadmap

This is **P0 — the foundation**. Upcoming phases:

| Phase | Feature | Status |
|-------|---------|--------|
| P0 | CLI scaffold + session listing | ✅ Done |
| P1 | SQLite storage + full-text search | 🔜 Next |
| P2 | Session viewer (conversation replay) | Planned |
| P3 | AI-powered action extraction | Planned |
| P4 | Daily work log generation | Planned |
| P5 | Background daemon (auto-run) | Planned |
| P6 | Weekly/monthly reports | Planned |
| P7 | Open source release | Planned |

---

## Tech Stack

- **TypeScript** — Type-safe from day one
- **Commander.js** — CLI argument parsing
- **tsup** — Fast ESM bundling
- **chalk** — Terminal colors
- **cli-table3** — Table rendering
- **dayjs** — Date formatting

---

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
node dist/cli.js init
node dist/cli.js sessions
```

---

## License

MIT
