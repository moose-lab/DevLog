# tmux Statusline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a tmux status-right integration that shows vibe coders their daily cost, session count, and agent activity state in real-time.

**Architecture:** Claude Code hooks write agent state (running/done/idle) to `~/.claude-status` as JSON. A shell script polled by tmux every 1s reads this file and calls `devlog statusline` for cost data, then renders a combined tmux-formatted string with color-coded cost tiers and a status indicator.

**Tech Stack:** Bash (hooks + tmux script), TypeScript (setup-tmux command), tmux color formatting

---

### Task 1: Create the tmux status renderer script

**Files:**
- Create: `scripts/tmux-claude-status.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
# tmux-claude-status.sh — called by tmux status-right every 1s
# Reads agent state from ~/.claude-status and cost from devlog statusline

set -euo pipefail

STATUS_FILE="$HOME/.claude-status"
STALE_THRESHOLD=30  # seconds — treat as idle if older
DEVLOG_BIN="${DEVLOG_BIN:-devlog}"

# ── Read agent state ──────────────────────────────────────
state="idle"
if [[ -f "$STATUS_FILE" ]]; then
  raw=$(cat "$STATUS_FILE" 2>/dev/null || echo '{}')
  state=$(echo "$raw" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
  ts=$(echo "$raw" | grep -o '"ts":[0-9]*' | head -1 | cut -d: -f2)
  state="${state:-idle}"

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
cost_line=$("$DEVLOG_BIN" statusline 2>/dev/null || echo "")

# ── Render ────────────────────────────────────────────────
# Cost color tiers: extract dollar amount for coloring
cost_color="colour82"  # green default
if [[ "$cost_line" =~ \$([0-9,]+\.?[0-9]*) ]]; then
  amount="${BASH_REMATCH[1]//,/}"
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
  echo "#[fg=${cost_color}]${cost_line}#[default] ${indicator}"
else
  echo "${indicator}"
fi
```

**Step 2: Make it executable and test manually**

Run:
```bash
chmod +x scripts/tmux-claude-status.sh
# Simulate: create a fake status file and test
echo '{"state":"running","ts":'$(date +%s)'}' > ~/.claude-status
DEVLOG_BIN="node $(pwd)/dist/cli.js" bash scripts/tmux-claude-status.sh
```

Expected: output with tmux color codes and cost data, like `#[fg=colour82]$0.42 today (2 sessions)#[default] #[fg=colour82,bold]⚡#[default]`

**Step 3: Commit**

```bash
git add scripts/tmux-claude-status.sh
git commit -m "feat: add tmux status renderer script"
```

---

### Task 2: Create the setup-tmux command

**Files:**
- Create: `src/commands/setup-tmux.ts`
- Modify: `src/cli.ts:1-14` (add import)
- Modify: `src/cli.ts:50-60` (add to KNOWN_COMMANDS)
- Modify: `src/cli.ts:230-231` (add command registration)

**Step 1: Write setup-tmux.ts**

This command does three things:
1. Installs Claude Code hooks into `~/.claude/settings.json`
2. Copies `tmux-claude-status.sh` to `~/.devlog/bin/`
3. Prints tmux config snippet for the user

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import chalk from "chalk";

const STATUS_FILE = join(homedir(), ".claude-status");

// The hook command: atomic write of JSON state to ~/.claude-status
function makeHookCommand(state: string): string {
  // Inline bash: write to tmp then mv for atomicity
  return `bash -c 'echo "{\\\"state\\\":\\\"${state}\\\",\\\"ts\\\":$(date +%s)}" > ${STATUS_FILE}.tmp && mv ${STATUS_FILE}.tmp ${STATUS_FILE}'`;
}

export async function setupTmuxCommand(): Promise<void> {
  // 1. Find devlog binary
  let devlogBin = "devlog";
  try {
    devlogBin = execFileSync("which", ["devlog"], { encoding: "utf-8" }).trim();
  } catch {
    // Fall back
  }

  // 2. Read existing Claude settings
  const claudeSettingsPath = join(homedir(), ".claude", "settings.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(claudeSettingsPath)) {
    try {
      settings = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
    } catch {
      settings = {};
    }
  }

  // 3. Install hooks (merge with existing)
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

  const hookEntries: [string, string][] = [
    ["PreToolUse", "running"],
    ["PostToolUse", "done"],
    ["Stop", "idle"],
  ];

  for (const [event, state] of hookEntries) {
    const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
    // Remove any previous devlog hook (idempotent)
    const filtered = existing.filter(
      (h: unknown) => !(h as Record<string, string>).command?.includes(".claude-status")
    );
    filtered.push({
      type: "command",
      command: makeHookCommand(state),
    });
    hooks[event] = filtered;
  }

  settings.hooks = hooks;

  // 4. Write settings back
  mkdirSync(dirname(claudeSettingsPath), { recursive: true });
  writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  console.log();
  console.log(chalk.green("  ✓") + chalk.bold.white(" Claude Code hooks installed"));

  // 5. Install tmux script to ~/.devlog/bin/
  const binDir = join(homedir(), ".devlog", "bin");
  mkdirSync(binDir, { recursive: true });

  const scriptSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "tmux-claude-status.sh");
  const scriptDest = join(binDir, "tmux-claude-status.sh");

  if (existsSync(scriptSrc)) {
    copyFileSync(scriptSrc, scriptDest);
    chmodSync(scriptDest, 0o755);
    console.log(chalk.green("  ✓") + chalk.bold.white(` Script installed to ${scriptDest}`));
  } else {
    // Fallback: script not found (running from dist), generate inline
    const scriptContent = generateTmuxScript(devlogBin);
    writeFileSync(scriptDest, scriptContent, "utf-8");
    chmodSync(scriptDest, 0o755);
    console.log(chalk.green("  ✓") + chalk.bold.white(` Script generated at ${scriptDest}`));
  }

  // 6. Print tmux config snippet
  console.log();
  console.log(chalk.bold.white("  Add this to your ~/.tmux.conf:"));
  console.log();
  console.log(chalk.cyan(`    set -g status-interval 1`));
  console.log(chalk.cyan(`    set -g status-right '#(${scriptDest})'`));
  console.log();
  console.log(chalk.dim("  Then reload tmux: ") + chalk.cyan("tmux source-file ~/.tmux.conf"));
  console.log();
}

function generateTmuxScript(devlogBin: string): string {
  return `#!/usr/bin/env bash
# Generated by devlog setup-tmux
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

cost_line=$("$DEVLOG_BIN" statusline 2>/dev/null || echo "")

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
  running) indicator="#[fg=colour82,bold]⚡#[default]" ;;
  done)    indicator="#[fg=colour65]✓#[default]" ;;
  error)   indicator="#[fg=colour196]✗#[default]" ;;
  *)       indicator="#[fg=colour243]○#[default]" ;;
esac

if [[ -n "$cost_line" ]]; then
  echo "#[fg=\${cost_color}]\${cost_line}#[default] \${indicator}"
else
  echo "\${indicator}"
fi
`;
}
```

**Step 2: Register in cli.ts**

Add import at top of `src/cli.ts`:
```typescript
import { setupTmuxCommand } from "./commands/setup-tmux.js";
```

Add `"setup-tmux"` to the `KNOWN_COMMANDS` array.

Add command registration before the "Did you mean?" block:
```typescript
// ── devlog setup-tmux ───────────────────────────────────
program
  .command("setup-tmux")
  .description("Configure tmux status bar with cost dashboard")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    try {
      await setupTmuxCommand();
    } catch (err) {
      handleError(err, globalOpts);
    }
  });
```

**Step 3: Build and verify**

Run:
```bash
pnpm build
node dist/cli.js setup-tmux --help
```

Expected: shows help text for setup-tmux command

**Step 4: Commit**

```bash
git add src/commands/setup-tmux.ts src/cli.ts
git commit -m "feat: add setup-tmux command for tmux cost dashboard"
```

---

### Task 3: Include scripts in the build output

**Files:**
- Modify: `tsup.config.ts` — no change needed (scripts/ is outside src/)
- Modify: `package.json:9` — add scripts to `"files"` array

**Step 1: Update package.json files field**

Change the `"files"` array to include scripts:
```json
"files": [
  "dist",
  "scripts"
],
```

**Step 2: Verify scripts are accessible from dist**

Run:
```bash
pnpm build && node dist/cli.js setup-tmux
```

Expected: hooks installed, script copied to `~/.devlog/bin/`, tmux config snippet printed.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: include scripts/ in package files"
```

---

### Task 4: End-to-end manual test

**Step 1: Test hooks write correctly**

Run:
```bash
# Simulate PreToolUse hook firing
bash -c 'echo "{\"state\":\"running\",\"ts\":'$(date +%s)'}" > ~/.claude-status.tmp && mv ~/.claude-status.tmp ~/.claude-status'
cat ~/.claude-status
```

Expected: `{"state":"running","ts":1741305600}` (or similar timestamp)

**Step 2: Test tmux script reads and renders**

Run:
```bash
~/.devlog/bin/tmux-claude-status.sh
```

Expected: tmux-formatted output like `#[fg=colour82]$0.42 today (2 sessions)#[default] #[fg=colour82,bold]⚡#[default]`

**Step 3: Test stale detection**

Run:
```bash
# Write a status with old timestamp (60s ago)
old_ts=$(( $(date +%s) - 60 ))
echo "{\"state\":\"running\",\"ts\":${old_ts}}" > ~/.claude-status
~/.devlog/bin/tmux-claude-status.sh
```

Expected: should show idle indicator `○` not running `⚡` because timestamp is stale

**Step 4: Test in live tmux**

Run:
```bash
tmux set -g status-interval 1
tmux set -g status-right '#(~/.devlog/bin/tmux-claude-status.sh)'
```

Expected: tmux status bar updates. Manually write different states to `~/.claude-status` and observe color changes.

**Step 5: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end testing"
```

---

### Task 5: Update help text and documentation

**Files:**
- Modify: `src/cli.ts:38-41` (add setup-tmux to Agent Integration section of help text)

**Step 1: Add to HELP_TEXT**

In the Agent Integration section, add:
```typescript
${chalk.cyan("  devlog setup-tmux")}${chalk.dim("              Configure tmux cost dashboard")}
```

**Step 2: Build and verify help**

Run:
```bash
pnpm build && node dist/cli.js --help
```

Expected: setup-tmux appears in the Agent Integration section

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "docs: add setup-tmux to CLI help text"
```
