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
  console.log(chalk.yellow("  ⚠ ") + msg);
}

export function printError(msg: string): void {
  console.log(chalk.red("  ✗ ") + msg);
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
