import chalk from "chalk";
import ora from "ora";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday.js";
import { ensureInit } from "../../core/config.js";
import { discoverProjects } from "../../core/discovery.js";
import type { Session, GlobalOptions } from "../../core/types.js";
import { costWithContext } from "../utils/format.js";
import { outputJson, isJsonMode, isQuietMode } from "../utils/output.js";

dayjs.extend(isToday);

interface CostOptions {
  period?: string;
}

function filterByPeriod(sessions: Session[], period: string): Session[] {
  const now = dayjs();
  return sessions.filter((s) => {
    const d = dayjs(s.updatedAt);
    switch (period) {
      case "today":
        return d.isToday();
      case "week":
        return now.diff(d, "day") < 7;
      case "month":
        return now.diff(d, "day") < 30;
      default:
        return true;
    }
  });
}

function renderBar(fraction: number, width: number = 16): string {
  const filled = Math.round(fraction * width);
  return chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(width - filled));
}

export async function costCommand(
  options: CostOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const { config } = ensureInit();
  const period = options.period || "all";

  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    spinner = ora({
      text: chalk.dim("  Calculating costs..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const projects = await discoverProjects(config.claudeDir);
  spinner?.stop();

  const allSessions: Session[] = [];
  for (const p of projects) allSessions.push(...p.sessions);
  const filtered = filterByPeriod(allSessions, period);

  // Aggregate by project and model
  const byProject = new Map<string, number>();
  const byModel = new Map<string, number>();
  let totalCost = 0;

  for (const s of filtered) {
    totalCost += s.meta.totalCostUSD;
    byProject.set(
      s.projectName,
      (byProject.get(s.projectName) || 0) + s.meta.totalCostUSD
    );
    for (const [model, cost] of Object.entries(s.meta.costByModel)) {
      byModel.set(model, (byModel.get(model) || 0) + cost);
    }
  }

  const periodLabel =
    period === "today"
      ? "Today"
      : period === "week"
        ? "This Week"
        : period === "month"
          ? "This Month"
          : "All Time";

  // JSON
  if (isJsonMode()) {
    outputJson({
      period: periodLabel,
      totalCostUSD: Math.round(totalCost * 1000000) / 1000000,
      byProject: [...byProject.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, cost]) => ({ name, costUSD: Math.round(cost * 1000000) / 1000000 })),
      byModel: [...byModel.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, cost]) => ({ name, costUSD: Math.round(cost * 1000000) / 1000000 })),
    });
    return;
  }

  console.log();
  console.log(
    chalk.bold.cyan("  ▌") + chalk.bold.white(` Cost Breakdown — ${periodLabel}`)
  );
  console.log();

  if (totalCost === 0) {
    console.log(chalk.dim("  No costs recorded in this period."));
    console.log();
    return;
  }

  console.log(
    chalk.dim("  Total: ") + costWithContext(totalCost)
  );
  console.log();

  // By project
  const projectEntries = [...byProject.entries()]
    .sort((a, b) => b[1] - a[1]);
  if (projectEntries.length > 0) {
    console.log(chalk.white("  By project:"));
    for (const [name, cost] of projectEntries) {
      const pct = totalCost > 0 ? Math.round((cost / totalCost) * 100) : 0;
      const costStr = cost < 1 ? `$${cost.toFixed(3)}` : `$${cost.toFixed(2)}`;
      console.log(
        chalk.dim("    ") +
          chalk.cyan(name.padEnd(18)) +
          chalk.yellow(costStr.padEnd(10)) +
          chalk.dim(`(${pct}%)`.padEnd(7)) +
          renderBar(cost / totalCost)
      );
    }
    console.log();
  }

  // By model
  const modelEntries = [...byModel.entries()]
    .sort((a, b) => b[1] - a[1]);
  if (modelEntries.length > 0) {
    console.log(chalk.white("  By model:"));
    for (const [name, cost] of modelEntries) {
      const pct = totalCost > 0 ? Math.round((cost / totalCost) * 100) : 0;
      const costStr = cost < 1 ? `$${cost.toFixed(3)}` : `$${cost.toFixed(2)}`;
      // Friendly model name
      let label = name;
      if (name.includes("opus")) label = "claude-opus";
      else if (name.includes("sonnet")) label = "claude-sonnet";
      else if (name.includes("haiku")) label = "claude-haiku";

      let context = "";
      if (pct > 70) context = "  most of your work";
      else if (pct < 20) context = "  for the hard stuff";

      console.log(
        chalk.dim("    ") +
          chalk.white(label.padEnd(18)) +
          chalk.yellow(costStr.padEnd(10)) +
          chalk.dim(`(${pct}%)`) +
          chalk.dim(context)
      );
    }
    console.log();
  }

  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.cyan("devlog stats") +
      chalk.dim(" usage trends  ·  ") +
      chalk.cyan("devlog cost --period week") +
      chalk.dim(" filter")
  );
  console.log();
}
