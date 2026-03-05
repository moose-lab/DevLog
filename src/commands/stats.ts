import chalk from "chalk";
import ora from "ora";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday.js";
import { ensureInit } from "../core/config.js";
import { discoverProjects, computeStats } from "../core/discovery.js";
import type { Session, GlobalOptions, AggregateStats } from "../core/types.js";
import {
  formatNumber,
  costWithContext,
} from "../utils/format.js";
import { outputJson, isJsonMode, isQuietMode } from "../utils/output.js";
import { updateCacheFromStats } from "../core/cache.js";

dayjs.extend(isToday);

interface StatsOptions {
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

export async function statsCommand(
  options: StatsOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const { config } = ensureInit();
  const period = options.period || "all";

  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    spinner = ora({
      text: chalk.dim("  Crunching numbers..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const projects = await discoverProjects(config.claudeDir);
  spinner?.stop();

  // Update cache as side effect of full scan
  if (projects.length > 0) {
    updateCacheFromStats(computeStats(projects));
  }

  const allSessions: Session[] = [];
  for (const p of projects) allSessions.push(...p.sessions);
  const filtered = filterByPeriod(allSessions, period);

  // Aggregate
  let totalCost = 0;
  let totalTools = 0;
  let totalMessages = 0;
  const fileSet = new Set<string>();
  const toolCounts = new Map<string, number>();
  const projectCounts = new Map<string, number>();
  const costByModel: Record<string, number> = {};

  for (const s of filtered) {
    totalCost += s.meta.totalCostUSD;
    totalTools += s.meta.toolCalls;
    totalMessages += s.meta.humanTurns + s.meta.assistantTurns;
    for (const f of s.meta.filesReferenced) fileSet.add(f);
    for (const t of s.meta.uniqueTools) {
      toolCounts.set(t, (toolCounts.get(t) || 0) + 1);
    }
    projectCounts.set(
      s.projectName,
      (projectCounts.get(s.projectName) || 0) + 1
    );
    for (const [model, cost] of Object.entries(s.meta.costByModel)) {
      costByModel[model] = (costByModel[model] || 0) + cost;
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
      sessionCount: filtered.length,
      totalMessages,
      totalToolCalls: totalTools,
      totalFilesTouched: fileSet.size,
      totalCostUSD: Math.round(totalCost * 1000000) / 1000000,
      topTools: [...toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
      projectBreakdown: [...projectCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, sessions: count })),
      costByModel,
    });
    return;
  }

  if (filtered.length === 0) {
    console.log();
    console.log(
      chalk.bold.cyan("  ▌") + chalk.bold.white(` Stats — ${periodLabel}`)
    );
    console.log();
    console.log(chalk.dim("  No sessions in this period."));
    console.log();
    return;
  }

  console.log();
  console.log(
    chalk.bold.cyan("  ▌") + chalk.bold.white(` Stats — ${periodLabel}`)
  );
  console.log();

  // Stats box
  const w = 42;
  const line = (label: string, value: string) => {
    const padding = w - label.length - value.length - 6;
    return (
      chalk.dim("  │ ") +
      chalk.white(label) +
      " ".repeat(Math.max(1, padding)) +
      chalk.cyan.bold(value) +
      chalk.dim(" │")
    );
  };

  console.log(chalk.dim("  ┌" + "─".repeat(w) + "┐"));
  console.log(line("Sessions", formatNumber(filtered.length)));
  console.log(line("Messages", formatNumber(totalMessages)));
  console.log(line("Commands run", formatNumber(totalTools)));
  console.log(line("Files touched", formatNumber(fileSet.size)));
  if (totalCost > 0) {
    const costStr = totalCost < 1 ? `$${totalCost.toFixed(3)}` : `$${totalCost.toFixed(2)}`;
    console.log(line("Total cost", costStr));
  }
  console.log(chalk.dim("  └" + "─".repeat(w) + "┘"));
  console.log();

  // Top tools
  const topTools = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topTools.length > 0) {
    console.log(chalk.white("  Most used tools:"));
    for (const [name, count] of topTools) {
      console.log(
        chalk.dim("    ") +
          chalk.green(name.padEnd(16)) +
          chalk.dim(`used in ${count} session${count === 1 ? "" : "s"}`)
      );
    }
    console.log();
  }

  // Most active project
  const topProjects = [...projectCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (topProjects.length > 0) {
    console.log(chalk.white("  Most active projects:"));
    for (const [name, count] of topProjects) {
      const sessionWord = count === 1 ? "session" : "sessions";
      console.log(
        chalk.dim("    ") +
          chalk.cyan(name.padEnd(16)) +
          chalk.dim(`${count} ${sessionWord}`)
      );
    }
    console.log();
  }

  // Cost context
  if (totalCost > 0) {
    console.log(
      chalk.dim("  Total cost: ") + costWithContext(totalCost)
    );
    console.log();
  }

  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.cyan("devlog cost") +
      chalk.dim(" cost breakdown  ·  ") +
      chalk.cyan("devlog stats --period week") +
      chalk.dim(" filter")
  );
  console.log();
}
