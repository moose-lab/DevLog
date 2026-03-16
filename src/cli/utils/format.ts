import chalk from "chalk";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import isToday from "dayjs/plugin/isToday.js";
import isYesterday from "dayjs/plugin/isYesterday.js";

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

/**
 * Smart time formatting:
 *   Today:     "2:30 PM" (just the time)
 *   Yesterday: "Yesterday 2:30 PM"
 *   This week: "Mon 2:30 PM"
 *   Older:     "Jan 15, 2:30 PM"
 */
export function formatSmartTime(date: Date): string {
  const d = dayjs(date);
  if (d.isToday()) return d.format("h:mm A");
  if (d.isYesterday()) return "Yest " + d.format("h:mm A");

  const now = dayjs();
  const diffDays = now.diff(d, "day");
  if (diffDays < 7) return d.format("ddd h:mm A");

  return d.format("MMM D, h:mm A");
}

export function formatDate(date: Date): string {
  return dayjs(date).format("YYYY-MM-DD HH:mm");
}

export function formatRelative(date: Date): string {
  return dayjs(date).fromNow();
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/**
 * Format cost with appropriate precision
 */
export function formatCost(usd: number): string {
  if (usd === 0) return chalk.dim("—");
  if (usd < 0.01) return chalk.green(`$${usd.toFixed(4)}`);
  if (usd < 1) return chalk.green(`$${usd.toFixed(3)}`);
  return chalk.yellow(`$${usd.toFixed(2)}`);
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms === 0) return chalk.dim("—");
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function formatRole(role: string): string {
  switch (role) {
    case "human":
      return chalk.blue.bold("You");
    case "assistant":
      return chalk.gray.bold("Claude");
    case "tool_use":
      return chalk.green.bold("Tool");
    case "tool_result":
      return chalk.yellow.bold("Result");
    default:
      return chalk.dim(role);
  }
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ── Styled printing ─────────────────────────────────────

export function printHeader(title: string): void {
  console.log();
  console.log(chalk.bold.white(title));
  console.log(chalk.dim("─".repeat(Math.min(title.length + 10, 60))));
}

export function printSuccess(msg: string): void {
  console.log(chalk.green("  ✓ ") + msg);
}

export function printWarn(msg: string): void {
  console.error(chalk.yellow("  ⚠ ") + msg);
}

export function printError(msg: string): void {
  console.error(chalk.red("  ✗ ") + msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.cyan("  ℹ ") + msg);
}

/**
 * Render a compact stat badge: "  label  value"
 */
export function statBadge(
  label: string,
  value: string | number,
  color: typeof chalk = chalk
): string {
  return (
    chalk.dim("  ") +
    chalk.dim(label + " ") +
    color(typeof value === "number" ? formatNumber(value) : value)
  );
}

// ── Humanize helpers (Principle 1: 说人话) ──────────────

const TOOL_NAMES: Record<string, string> = {
  Bash: "ran a command",
  Read: "read a file",
  Write: "wrote a file",
  Edit: "edited a file",
  Glob: "searched for files",
  Grep: "searched code",
  Agent: "used an agent",
  WebSearch: "searched the web",
  WebFetch: "fetched a page",
  TodoWrite: "updated todos",
  TodoRead: "checked todos",
};

/**
 * Map a raw tool name to a human-readable description.
 */
export function humanizeToolName(name: string): string {
  if (TOOL_NAMES[name]) return TOOL_NAMES[name];
  // CamelCase → space-separated lowercase
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

const TOOL_PLURALS: Record<string, { singular: string; plural: string }> = {
  Bash: { singular: "ran a command", plural: "ran commands" },
  Read: { singular: "read a file", plural: "read files" },
  Write: { singular: "wrote a file", plural: "wrote files" },
  Edit: { singular: "edited a file", plural: "edited files" },
  Glob: { singular: "searched for files", plural: "searched for files" },
  Grep: { singular: "searched code", plural: "searched code" },
  Agent: { singular: "used an agent", plural: "used agents" },
};

/**
 * Group tool arrays into a summary like "read 3 files, ran 2 commands, edited 1 file".
 */
export function humanizeToolSummary(tools: string[]): string {
  const counts = new Map<string, number>();
  for (const t of tools) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }

  const parts: string[] = [];
  for (const [name, count] of counts) {
    const p = TOOL_PLURALS[name];
    if (p) {
      parts.push(count === 1 ? p.singular : `${p.plural}`);
    } else {
      const human = humanizeToolName(name);
      parts.push(count === 1 ? human : `${human} (×${count})`);
    }
  }

  if (parts.length === 0) return "";
  if (parts.length === 1) return `Claude ${parts[0]}`;
  const last = parts.pop()!;
  return `Claude ${parts.join(", ")}, and ${last}`;
}

// ── Context helpers (Principle 5: 数字要有上下文) ────────

/**
 * Cost with context suffix.
 */
export function costWithContext(usd: number): string {
  if (usd === 0) return chalk.dim("—");

  const formatted =
    usd < 0.01
      ? `$${usd.toFixed(4)}`
      : usd < 1
        ? `$${usd.toFixed(3)}`
        : `$${usd.toFixed(2)}`;

  let context = "";
  if (usd < 0.01) context = " — barely a penny";
  else if (usd < 0.05) context = " — pocket change";
  else if (usd < 0.15) context = " — pretty efficient";
  else if (usd < 0.50) context = " — a good session";
  else if (usd < 1) context = " — solid investment";
  else if (usd < 5) context = " — heavy session";
  else context = " — serious work";

  return chalk.yellow(formatted) + chalk.dim(context);
}

/**
 * Message count with context.
 */
export function messageCountContext(turns: number): string {
  if (turns <= 2) return chalk.dim("quick question");
  if (turns <= 4) return chalk.dim("quick chat");
  if (turns <= 10) return chalk.dim(`${turns} messages`);
  if (turns <= 25) return chalk.white(`${turns} messages`) + chalk.dim(" — solid session");
  if (turns <= 50) return chalk.white(`${turns} messages`) + chalk.dim(" — deep dive");
  return chalk.white(`${turns} messages`) + chalk.dim(" — marathon");
}

/**
 * File count with context.
 */
export function fileCountContext(count: number): string {
  if (count === 0) return "";
  if (count === 1) return chalk.blue("touched 1 file");
  if (count <= 5) return chalk.blue(`touched ${count} files`);
  if (count <= 15) return chalk.blue(`touched ${count} files`) + chalk.dim(" — broad changes");
  return chalk.blue(`touched ${count} files`) + chalk.dim(" — major refactor");
}

/**
 * Tool count with context.
 */
export function toolCountContext(count: number): string {
  if (count === 0) return "";
  if (count <= 10) return chalk.green(`ran ${count} commands`);
  if (count <= 30) return chalk.green(`ran ${count} commands`) + chalk.dim(" — busy session");
  return chalk.green(`ran ${count} commands`) + chalk.dim(" — heavy automation");
}

// ── Fuzzy matching (Principle 3: 永远不卡住) ────────────

/**
 * Simple Levenshtein distance for "did you mean?" suggestions.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
