import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { ensureInit } from "../core/config.js";
import { discoverProjects, computeStats } from "../core/discovery.js";
import { updateCacheFromStats } from "../core/cache.js";

interface Hook {
  type: string;
  command: string;
}

function makeHookCommand(state: string): string {
  return `bash -c 'echo "{\\"state\\":\\"${state}\\",\\"ts\\":$(date +%s)}" > ~/.claude-status.tmp && mv ~/.claude-status.tmp ~/.claude-status'`;
}

function generateTmuxScript(devlogBin: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail
STATUS_FILE="$HOME/.claude-status"
STALE_THRESHOLD=30
DEVLOG_BIN="${devlogBin}"

state="idle"
if [[ -f "$STATUS_FILE" ]]; then
  raw=$(cat "$STATUS_FILE" 2>/dev/null || echo '{}')
  state=$(echo "$raw" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
  ts=$(echo "$raw" | grep -o '"ts":[0-9]*' | head -1 | cut -d: -f2)
  state="\${state:-idle}"
  if [[ -n "$ts" ]]; then
    now=$(date +%s)
    age=$(( now - ts ))
    if (( age > STALE_THRESHOLD )); then
      state="idle"
    fi
  fi
fi

cost_line=$("$DEVLOG_BIN" statusline < /dev/null 2>/dev/null || echo "")

cost_color="colour82"
if [[ "$cost_line" =~ \\$([0-9,]+\\.?[0-9]*) ]]; then
  amount="\${BASH_REMATCH[1]//,/}"
  cents=$(echo "$amount" | awk '{printf "%d", $1 * 100}')
  if (( cents >= 1000 )); then
    cost_color="colour196"
  elif (( cents >= 100 )); then
    cost_color="colour226"
  fi
fi

case "$state" in
  running) indicator="#[fg=colour82,bold]\u26A1#[default]" ;;
  done)    indicator="#[fg=colour65]\u2713#[default]" ;;
  error)   indicator="#[fg=colour196]\u2717#[default]" ;;
  *)       indicator="#[fg=colour243]\u25CB#[default]" ;;
esac

if [[ -n "$cost_line" ]]; then
  echo "#[fg=\${cost_color}]\${cost_line}#[default] \${indicator}"
else
  echo "\${indicator}"
fi
`;
}

const TMUX_COMMENT = "# DevLog status bar";

export async function setupStatuslineCommand(): Promise<void> {
  const { config } = ensureInit();

  // 1. Find devlog binary path
  let devlogBin = "devlog";
  try {
    devlogBin = execFileSync("which", ["devlog"], { encoding: "utf-8" }).trim();
  } catch {
    // Fall back
  }

  // ── Claude Code: statusLine + hooks ───────────────────
  const claudeSettingsPath = join(homedir(), ".claude", "settings.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(claudeSettingsPath)) {
    try {
      settings = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
    } catch {
      settings = {};
    }
  }

  settings.statusLine = {
    type: "command",
    command: `${devlogBin} statusline`,
  };

  const hooks = ((settings.hooks as Record<string, Hook[]>) ?? {}) as Record<string, Hook[]>;
  for (const [event, state] of [["PreToolUse", "running"], ["PostToolUse", "done"], ["Stop", "idle"]] as const) {
    const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
    const filtered = existing.filter((h) => !h.command?.includes(".claude-status"));
    filtered.push({ type: "command", command: makeHookCommand(state) });
    hooks[event] = filtered;
  }
  settings.hooks = hooks;

  mkdirSync(dirname(claudeSettingsPath), { recursive: true });
  writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  console.log();
  console.log(chalk.green("  \u2713") + chalk.bold.white(" Claude Code status line + hooks configured"));

  // ── tmux: install script + auto-configure ─────────────
  const binDir = join(homedir(), ".devlog", "bin");
  const scriptDest = join(binDir, "tmux-claude-status.sh");
  mkdirSync(binDir, { recursive: true });

  // Copy source script or generate inline
  const thisFile = fileURLToPath(import.meta.url);
  const scriptSrc = join(dirname(thisFile), "..", "..", "scripts", "tmux-claude-status.sh");

  if (existsSync(scriptSrc)) {
    copyFileSync(scriptSrc, scriptDest);
  } else {
    writeFileSync(scriptDest, generateTmuxScript(devlogBin), "utf-8");
  }
  chmodSync(scriptDest, 0o755);

  console.log(chalk.green("  \u2713") + chalk.bold.white(" tmux status script installed"));

  // Auto-configure ~/.tmux.conf
  const tmuxConfPath = join(homedir(), ".tmux.conf");
  let tmuxConf = "";
  if (existsSync(tmuxConfPath)) {
    tmuxConf = readFileSync(tmuxConfPath, "utf-8");
  }

  if (!tmuxConf.includes("tmux-claude-status.sh")) {
    // Append DevLog tmux config
    const snippet = [
      "",
      TMUX_COMMENT,
      "set -g status-interval 1",
      `set -g status-right '#(${scriptDest})'`,
      "",
    ].join("\n");

    writeFileSync(tmuxConfPath, tmuxConf + snippet, "utf-8");
    console.log(chalk.green("  \u2713") + chalk.bold.white(" tmux.conf configured"));

    // Try to reload tmux if running
    try {
      execFileSync("tmux", ["source-file", tmuxConfPath], { stdio: "ignore" });
      console.log(chalk.green("  \u2713") + chalk.bold.white(" tmux reloaded"));
    } catch {
      // tmux not running — that's fine
    }
  } else {
    console.log(chalk.dim("  \u2713 tmux.conf already configured"));
  }

  // ── Warm cache ────────────────────────────────────────
  console.log();
  console.log(chalk.dim("  Warming cache..."));
  try {
    const projects = await discoverProjects(config.claudeDir);
    if (projects.length > 0) {
      updateCacheFromStats(computeStats(projects));
    }
    console.log(chalk.dim("  Cache ready."));
  } catch {
    console.log(chalk.dim("  Cache will be built on first use."));
  }

  console.log();
  console.log(chalk.white("  Restart Claude Code to see status bar data."));
  console.log(chalk.white("  tmux users: cost data with color highlights in status bar."));
  console.log();
}
