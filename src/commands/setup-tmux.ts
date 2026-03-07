import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import chalk from "chalk";

interface Hook {
  type: string;
  command: string;
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: Hook[];
    PostToolUse?: Hook[];
    Stop?: Hook[];
    [key: string]: Hook[] | undefined;
  };
  [key: string]: unknown;
}

function makeHookCommand(state: string): string {
  return `bash -c 'echo "{\\"state\\":\\"${state}\\",\\"ts\\":$(date +%s)}" > ~/.claude-status.tmp && mv ~/.claude-status.tmp ~/.claude-status'`;
}

function removeExistingDevlogHooks(hooks: Hook[]): Hook[] {
  return hooks.filter((h) => !h.command.includes(".claude-status"));
}

function generateTmuxScript(devlogBin: string): string {
  return `#!/usr/bin/env bash
# tmux-claude-status.sh — called by tmux status-right every 1s
# Reads agent state from ~/.claude-status and cost from devlog statusline

set -euo pipefail

STATUS_FILE="$HOME/.claude-status"
STALE_THRESHOLD=30  # seconds — treat as idle if older
DEVLOG_BIN="${devlogBin}"

# ── Read agent state ──────────────────────────────────────
state="idle"
if [[ -f "$STATUS_FILE" ]]; then
  raw=$(cat "$STATUS_FILE" 2>/dev/null || echo '{}')
  state=$(echo "$raw" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
  ts=$(echo "$raw" | grep -o '"ts":[0-9]*' | head -1 | cut -d: -f2)
  state="\${state:-idle}"

  # Stale check: if timestamp is older than threshold, force idle
  if [[ -n "$ts" ]]; then
    now=$(date +%s)
    age=$(( now - ts ))
    if (( age > STALE_THRESHOLD )); then
      state="idle"
    fi
  fi
fi

# ── Read cost data ────────────────────────────────────────
cost_line=$("$DEVLOG_BIN" statusline < /dev/null 2>/dev/null || echo "")

# ── Render ────────────────────────────────────────────────
# Cost color tiers: extract dollar amount for coloring
cost_color="colour82"  # green default
if [[ "$cost_line" =~ \\$([0-9,]+\\.?[0-9]*) ]]; then
  amount="\${BASH_REMATCH[1]//,/}"
  # Compare as integer cents to avoid bash float issues
  cents=$(echo "$amount" | awk '{printf "%d", $1 * 100}')
  if (( cents >= 1000 )); then
    cost_color="colour196"  # red: >$10
  elif (( cents >= 100 )); then
    cost_color="colour226"  # yellow: $1-10
  fi
fi

# State indicator
case "$state" in
  running) indicator="#[fg=colour82,bold]⚡#[default]" ;;
  done)    indicator="#[fg=colour65]✓#[default]" ;;
  error)   indicator="#[fg=colour196]✗#[default]" ;;
  *)       indicator="#[fg=colour243]○#[default]" ;;
esac

# Final output
if [[ -n "$cost_line" ]]; then
  echo "#[fg=\${cost_color}]\${cost_line}#[default] \${indicator}"
else
  echo "\${indicator}"
fi
`;
}

export async function setupTmuxCommand(): Promise<void> {
  // 1. Find devlog binary path
  let devlogBin = "devlog";
  try {
    devlogBin = execFileSync("which", ["devlog"], { encoding: "utf-8" }).trim();
  } catch {
    // Fall back to "devlog" and hope it's in PATH
  }

  // ── Step 1: Install Claude Code hooks into ~/.claude/settings.json ──
  const claudeSettingsPath = join(homedir(), ".claude", "settings.json");
  let settings: ClaudeSettings = {};
  if (existsSync(claudeSettingsPath)) {
    try {
      settings = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
    } catch {
      settings = {};
    }
  }

  // Ensure hooks structure exists
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Remove existing devlog hooks (idempotent), then add new ones
  const preToolUse = removeExistingDevlogHooks(settings.hooks.PreToolUse ?? []);
  preToolUse.push({ type: "command", command: makeHookCommand("running") });
  settings.hooks.PreToolUse = preToolUse;

  const postToolUse = removeExistingDevlogHooks(settings.hooks.PostToolUse ?? []);
  postToolUse.push({ type: "command", command: makeHookCommand("done") });
  settings.hooks.PostToolUse = postToolUse;

  const stop = removeExistingDevlogHooks(settings.hooks.Stop ?? []);
  stop.push({ type: "command", command: makeHookCommand("idle") });
  settings.hooks.Stop = stop;

  mkdirSync(dirname(claudeSettingsPath), { recursive: true });
  writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  console.log();
  console.log(chalk.green("  \u2713") + chalk.bold.white(" Claude Code hooks installed"));

  // ── Step 2: Install tmux-claude-status.sh to ~/.devlog/bin/ ──
  const destDir = join(homedir(), ".devlog", "bin");
  const destPath = join(destDir, "tmux-claude-status.sh");
  mkdirSync(destDir, { recursive: true });

  // Resolve the source script relative to this file (dist/commands/setup-tmux.js)
  const thisFile = fileURLToPath(import.meta.url);
  const srcPath = join(dirname(thisFile), "..", "..", "scripts", "tmux-claude-status.sh");

  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
  } else {
    // Fallback: generate the script inline with hardcoded DEVLOG_BIN
    writeFileSync(destPath, generateTmuxScript(devlogBin), "utf-8");
  }
  chmodSync(destPath, 0o755);

  console.log(chalk.green("  \u2713") + chalk.bold.white(` tmux script installed to ${destPath}`));

  // ── Step 3: Print tmux config snippet ──
  console.log();
  console.log(chalk.bold.white("  Add this to your ~/.tmux.conf:"));
  console.log();
  console.log(chalk.cyan("    set -g status-interval 1"));
  console.log(chalk.cyan("    set -g status-right '#(~/.devlog/bin/tmux-claude-status.sh)'"));
  console.log();
  console.log(chalk.bold.white("  Then reload tmux:"));
  console.log();
  console.log(chalk.cyan("    tmux source-file ~/.tmux.conf"));
  console.log();
}
