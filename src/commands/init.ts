import { existsSync } from "fs";
import chalk from "chalk";
import ora from "ora";
import { initConfig, isInitialized, loadConfig } from "../core/config.js";
import { getClaudeProjectsDir, getDevlogDir } from "../utils/paths.js";
import { discoverProjects, computeStats } from "../core/discovery.js";
import {
  printSuccess,
  printError,
  formatNumber,
} from "../utils/format.js";

export async function initCommand(): Promise<void> {
  console.log();
  console.log(
    chalk.bold.cyan("  ▌") + chalk.bold.white(" DevLog Setup")
  );
  console.log();

  // Already initialized
  if (isInitialized()) {
    const config = loadConfig();
    printSuccess("DevLog is already set up");
    console.log(
      chalk.dim("    Config: ") + chalk.white(getDevlogDir() + "/config.toml")
    );
    console.log(
      chalk.dim("    Claude: ") + chalk.white(config.claudeDir)
    );
    console.log();

    const spinner = ora({
      text: chalk.dim("  Checking your sessions..."),
      spinner: "dots",
      color: "cyan",
    }).start();

    const projects = await discoverProjects(config.claudeDir);
    const stats = computeStats(projects);
    spinner.stop();

    renderStatsBox(stats);

    console.log(
      chalk.dim("  Everything looks good! Run ") +
        chalk.cyan("devlog") +
        chalk.dim(" to see your dashboard.")
    );
    console.log();
    return;
  }

  // Check Claude Code
  const claudeDir = getClaudeProjectsDir();

  if (!existsSync(claudeDir)) {
    printError("Claude Code not found");
    console.log();
    console.log(
      chalk.white("  I looked for: ") + chalk.dim("~/.claude/projects/")
    );
    console.log();
    console.log(chalk.white("  To get started:"));
    console.log(
      chalk.dim("  1. Install Claude Code  →  ") + chalk.cyan("https://claude.ai/code")
    );
    console.log(
      chalk.dim("  2. Have a conversation with Claude in any project")
    );
    console.log(
      chalk.dim("  3. Come back and run ") + chalk.cyan("devlog") + chalk.dim(" again")
    );
    console.log();
    return;
  }

  printSuccess("Found Claude Code");

  const config = initConfig();
  printSuccess("Created config at " + chalk.dim("~/.devlog/"));

  const spinner = ora({
    text: chalk.dim("  Scanning your Claude Code history..."),
    spinner: "dots",
    color: "cyan",
  }).start();

  const projects = await discoverProjects(config.claudeDir);
  const stats = computeStats(projects);
  spinner.stop();

  printSuccess("Scan complete");
  console.log();

  renderStatsBox(stats);

  console.log(
    chalk.white("  You're all set! Run ") +
      chalk.cyan.bold("devlog") +
      chalk.white(" to see your dashboard.")
  );
  console.log();
}

function renderStatsBox(stats: ReturnType<typeof computeStats>): void {
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
  console.log(line("Projects", formatNumber(stats.totalProjects)));
  console.log(line("Conversations", formatNumber(stats.totalSessions)));
  console.log(line("Messages", formatNumber(stats.totalMessages)));
  console.log(line("Commands run", formatNumber(stats.totalToolCalls)));
  console.log(
    line("Files touched", formatNumber(stats.allFilesReferenced.length))
  );
  if (stats.totalCostUSD > 0) {
    console.log(line("Total cost", `$${stats.totalCostUSD.toFixed(3)}`));
  }
  console.log(chalk.dim("  └" + "─".repeat(w) + "┘"));
  console.log();
}
