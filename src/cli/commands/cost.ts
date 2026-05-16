import chalk from "chalk";
import ora from "ora";
import { buildCostReport, type CostPeriodTotals, type CostReport } from "../../core/cost-tracker.js";
import type { GlobalOptions } from "../../core/types.js";
import { costWithContext } from "../utils/format.js";
import { outputJson, isJsonMode, isQuietMode } from "../utils/output.js";

interface CostOptions {
  period?: string;
}

type PeriodKey = "today" | "week" | "month" | "allTime";

function normalizePeriod(period: string | undefined): PeriodKey {
  switch (period) {
    case "today":
      return "today";
    case "week":
      return "week";
    case "month":
    case "1m":
      return "month";
    default:
      return "allTime";
  }
}

function periodLabel(period: PeriodKey): string {
  if (period === "today") return "Today";
  if (period === "week") return "This Week";
  if (period === "month") return "1 Month";
  return "All Time";
}

function renderBar(fraction: number, width: number = 16): string {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(width - filled));
}

function formatUsd(value: number): string {
  if (value <= 0) return "$0.000";
  return value < 1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`;
}

function formatCredits(value: number): string {
  if (value <= 0) return "0 credits";
  return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} credits`;
}

export async function costCommand(
  options: CostOptions,
  _globalOpts: GlobalOptions
): Promise<void> {
  const period = normalizePeriod(options.period);

  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    spinner = ora({
      text: chalk.dim("  Calculating costs..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const report = await buildCostReport();
  spinner?.stop();

  if (isJsonMode()) {
    outputJson(report);
    return;
  }

  renderReport(report, period);
}

function renderReport(report: CostReport, period: PeriodKey): void {
  const total = report.totals[period];

  console.log();
  console.log(
    chalk.bold.cyan("  ▌") + chalk.bold.white(` Cost Breakdown — ${periodLabel(period)}`)
  );
  console.log();

  if (total.apiCostUSD === 0 && total.subscriptionCredits === 0) {
    console.log(chalk.dim("  No costs recorded in this period."));
    console.log();
    return;
  }

  console.log(chalk.dim("  API estimate: ") + costWithContext(total.apiCostUSD));
  if (total.subscriptionCredits > 0) {
    console.log(chalk.dim("  Subscription usage: ") + chalk.yellow(formatCredits(total.subscriptionCredits)));
  }
  console.log(chalk.dim("  Tokens: ") + chalk.white(total.totalTokens.toLocaleString()));
  console.log();

  renderQuota(report);
  renderProviders(report, period, total);
  renderProjects(report, period, total);

  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.cyan("devlog cost --json") +
      chalk.dim(" full report  ·  ") +
      chalk.cyan("devlog cost --period week") +
      chalk.dim(" weekly view  ·  ") +
      chalk.cyan("devlog cost --period month") +
      chalk.dim(" monthly view")
  );
  console.log();
}

function renderQuota(report: CostReport): void {
  if (report.quota.length === 0) return;

  console.log(chalk.white("  Quota:"));
  for (const q of report.quota) {
    const label = q.name === "primary" ? "daily/window" : "weekly";
    const reset = q.resetsAt ? ` resets ${new Date(q.resetsAt).toLocaleString()}` : "";
    console.log(
      chalk.dim("    ") +
        chalk.cyan(label.padEnd(14)) +
        chalk.yellow(`${q.usedPercent.toFixed(1)}% used`.padEnd(14)) +
        chalk.dim(`${q.remainingPercent.toFixed(1)}% left`) +
        chalk.dim(reset)
    );
  }
  console.log();
}

function renderProviders(report: CostReport, period: PeriodKey, total: CostPeriodTotals): void {
  console.log(chalk.white("  By provider:"));
  for (const provider of report.providers) {
    const p = provider[period];
    if (p.apiCostUSD === 0 && p.subscriptionCredits === 0) continue;
    const pct = total.apiCostUSD > 0 ? p.apiCostUSD / total.apiCostUSD : 0;
    const label = provider.provider === "claude_code" ? "Claude Code" : "Codex";
    console.log(
      chalk.dim("    ") +
        chalk.cyan(label.padEnd(18)) +
        chalk.yellow(formatUsd(p.apiCostUSD).padEnd(10)) +
        chalk.dim(formatCredits(p.subscriptionCredits).padEnd(15)) +
        renderBar(pct)
    );
  }
  console.log();
}

function renderProjects(report: CostReport, period: PeriodKey, total: CostPeriodTotals): void {
  console.log(chalk.white("  By project:"));
  for (const project of report.projects.slice(0, 12)) {
    const p = project[period];
    if (p.apiCostUSD === 0 && p.subscriptionCredits === 0) continue;
    const pct = total.apiCostUSD > 0 ? p.apiCostUSD / total.apiCostUSD : 0;
    const name = project.projectName.length > 24 ? `${project.projectName.slice(0, 23)}…` : project.projectName;
    console.log(
      chalk.dim("    ") +
        chalk.cyan(name.padEnd(25)) +
        chalk.yellow(formatUsd(p.apiCostUSD).padEnd(10)) +
        chalk.dim(formatCredits(p.subscriptionCredits).padEnd(15)) +
        renderBar(pct)
    );
  }
  console.log();
}
