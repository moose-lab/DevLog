# DevLog tmux Statusline Design

## Problem

Vibe coders using Claude Code (and similar agents) want to see cost and activity at a glance without switching context. The existing `devlog statusline` outputs plain text for Claude Code's built-in status bar, but it's buried inside the terminal. A tmux status-right integration puts this data in an always-visible location.

## User Persona

Vibe coders who care about "how much am I spending?" — not which tool or model the agent is using. The agent activity indicator is a small signal light, not the main feature.

## Architecture

```
Claude Code                         tmux status-right
-------------------------------     ----------------------------------
PreToolUse hook  --\                 tmux-claude-status.sh (every 1s)
PostToolUse hook ---+--> write -->   ~/.claude-status (JSON file)
Stop hook        --/                     |
                                         +-- read agent state
                                         +-- call `devlog statusline`
                                         |   (5min cache, cheap)
                                         +-- merge & render
                                         v
                                    $4.32 today . 3 sessions . [active]
```

## Data Layers

| Data             | Source                        | Freshness   |
|------------------|-------------------------------|-------------|
| Cost & sessions  | `devlog statusline` (existing)| 5min cache  |
| Agent state      | hooks -> ~/.claude-status     | Real-time   |

## Components

### 1. Hook Scripts

Three hooks configured in `~/.claude/settings.json`:

- **PreToolUse**: write `{"state":"running","ts":<epoch>}`
- **PostToolUse**: write `{"state":"done","ts":<epoch>}`
- **Stop**: write `{"state":"idle","ts":<epoch>}`

All writes are atomic (write to .tmp, then mv). File path: `~/.claude-status`.

Hook config format in settings.json:
```json
{
  "hooks": {
    "PreToolUse": [{ "type": "command", "command": "..." }],
    "PostToolUse": [{ "type": "command", "command": "..." }],
    "Stop": [{ "type": "command", "command": "..." }]
  }
}
```

The hook command is a single inline bash snippet that does the atomic write. No external script dependency — keeps installation minimal.

### 2. tmux-claude-status.sh

Shell script called by tmux every 1 second via `status-interval 1` and `status-right` config.

Logic:
1. Read `~/.claude-status` — parse state and timestamp
2. If timestamp is stale (>30s), treat as idle (agent may have crashed)
3. Call `devlog statusline` — get cost string (has its own 5min cache)
4. Render combined output with tmux color formatting

Output examples:
```
Active:   #[fg=colour226]$4.32 today#[default] . 3 sessions . #[fg=colour82]⚡#[default]
Idle:     #[fg=colour226]$4.32 today#[default] . 3 sessions . #[fg=colour243]○#[default]
Error:    #[fg=colour226]$4.32 today#[default] . 3 sessions . #[fg=colour196]✗#[default]
```

Cost color tiers:
- < $1: green (colour82)
- $1-10: yellow (colour226)
- > $10: red (colour196)

### 3. `devlog setup-tmux` Command

New CLI command that automates the full setup:

1. Install hooks into `~/.claude/settings.json` (merge with existing hooks)
2. Install `tmux-claude-status.sh` to `~/.devlog/bin/`
3. Print tmux config snippet for the user to add to `~/.tmux.conf`
4. Optionally auto-append to `~/.tmux.conf` with confirmation

Does NOT auto-modify tmux.conf without asking — that's the user's territory.

### 4. Changes to `devlog statusline`

Minimal. The existing command already outputs the cost data needed. One change: ensure output is clean enough to embed (no trailing newline, no ANSI codes when not TTY — already the case).

## File Layout

```
src/commands/setup-tmux.ts    # new: setup-tmux command
scripts/tmux-claude-status.sh # new: tmux status script
scripts/claude-status-hook.sh # new: hook one-liner (or inline)
```

## Implementation Plan

1. Write hook logic (inline bash, atomic write to ~/.claude-status)
2. Write tmux-claude-status.sh (read status file + call devlog statusline + render)
3. Write setup-tmux command (install hooks + copy script + print config)
4. Register setup-tmux in cli.ts
5. Test end-to-end: hooks fire -> file updates -> tmux renders

## Non-Goals

- No FIFO/named pipe — regular file with atomic write is simpler and matches 1s polling
- No SQLite for status — overkill for a single state value
- No multi-agent orchestration in v1 — just Claude Code
- No model/tool name display — users don't care
