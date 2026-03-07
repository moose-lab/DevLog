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
cost_line=$("$DEVLOG_BIN" statusline < /dev/null 2>/dev/null || echo "")

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
