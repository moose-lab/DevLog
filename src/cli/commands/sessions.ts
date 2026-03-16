import chalk from "chalk";
import ora from "ora";
import { ensureInit } from "../../core/config.js";
import { discoverProjects, computeStats } from "../../core/discovery.js";
import type { Session, GlobalOptions, SessionsJson } from "../../core/types.js";
import {
  formatSmartTime,
  truncate,
  formatNumber,
  costWithContext,
  messageCountContext,
  toolCountContext,
  fileCountContext,
} from "../utils/format.js";
import { outputJson, isJsonMode, isQuietMode } from "../utils/output.js";
import { toSessionJson } from "./shared.js";

interface SessionsOptions {
  project?: string;
  limit?: string;
  all?: boolean;
}

export async function sessionsCommand(options: SessionsOptions, globalOpts: GlobalOptions): Promise<void> {
  const { config, isFirstRun } = ensureInit();
  const limit = options.all ? Infinity : parseInt(options.limit || "30", 10);

  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    spinner = ora({
      text: chalk.dim("  Scanning sessions..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const projects = await discoverProjects(config.claudeDir);
  const stats = computeStats(projects);
  spinner?.stop();

  if (projects.length === 0) {
    if (isJsonMode()) {
      outputJson({ projects: [] });
      return;
    }
    console.log();
    console.log(chalk.white("  No sessions found yet."));
    console.log(
      chalk.dim("  Start a Claude Code session in any project, then come back!")
    );
    console.log();
    return;
  }

  // Filter by project if specified
  const filteredProjects = options.project
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(options.project!.toLowerCase()) ||
          p.path.toLowerCase().includes(options.project!.toLowerCase())
      )
    : projects;

  // ── JSON output ────────────────────────────────────
  if (isJsonMode()) {
    const data: SessionsJson = {
      projects: filteredProjects.map((p) => ({
        name: p.name,
        path: p.path,
        sessionCount: p.sessionCount,
        sessions: p.sessions.map(toSessionJson),
      })),
    };
    outputJson(data);
    return;
  }

  if (filteredProjects.length === 0) {
    console.log();
    console.log(
      chalk.yellow("  No projects matching ") +
        chalk.white(`"${options.project}"`)
    );
    console.log();
    console.log(chalk.white("  Your projects:"));
    for (const p of projects) {
      console.log(
        chalk.cyan(`    ${p.name}`) +
          chalk.dim(` — ${p.sessionCount} session${p.sessionCount === 1 ? "" : "s"}`)
      );
    }
    console.log();
    console.log(
      chalk.dim("  Try: ") +
        chalk.cyan(`devlog sessions -p ${projects[0].name}`)
    );
    console.log();
    return;
  }

  // Header
  console.log();
  console.log(
    chalk.bold.cyan("  ▌") +
      chalk.bold.white(" All Sessions") +
      (options.project ? chalk.dim(` matching "${options.project}"`) : "")
  );
  console.log(
    chalk.dim(
      `    ${formatNumber(stats.totalProjects)} projects · ${formatNumber(stats.totalSessions)} conversations · ${formatNumber(stats.totalMessages)} messages`
    )
  );
  console.log();

  if (isFirstRun) {
    console.log(
      chalk.dim("  Each project shows your Claude conversations, newest first.")
    );
    console.log(
      chalk.dim("  Pick one with ") +
        chalk.cyan("devlog show <number>") +
        chalk.dim(" to see the full chat.")
    );
    console.log();
  }

  let displayedCount = 0;
  let sessionIndex = 0;

  for (const project of filteredProjects) {
    if (displayedCount >= limit) break;

    const sessionWord = project.sessionCount === 1 ? "session" : "sessions";
    console.log(
      chalk.bold.white("  📁 " + project.name) +
        chalk.dim(` — ${project.sessionCount} ${sessionWord}`)
    );
    console.log(chalk.dim("     " + project.path));
    console.log();

    const sessionsToShow = project.sessions.slice(0, limit - displayedCount);

    for (const session of sessionsToShow) {
      sessionIndex++;
      renderSessionRow(session, sessionIndex);
      displayedCount++;
    }

    if (project.sessions.length > sessionsToShow.length) {
      const remaining = project.sessions.length - sessionsToShow.length;
      console.log(
        chalk.dim(`     + ${remaining} more — use `) +
          chalk.cyan("--all") +
          chalk.dim(" to show all")
      );
      console.log();
    }
  }

  // Footer
  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.cyan("devlog show 1") +
      chalk.dim(" view most recent  ·  ") +
      chalk.cyan("devlog sessions -p <name>") +
      chalk.dim(" filter")
  );
  console.log();
}

function renderSessionRow(session: Session, index: number): void {
  const m = session.meta;
  const time = formatSmartTime(session.updatedAt);
  const preview = m.firstUserMessage
    ? truncate(m.firstUserMessage.replace(/\n/g, " ").trim(), 46)
    : chalk.dim("(empty)");

  const indexStr = chalk.dim(`${index}.`.padEnd(4));
  console.log(
    chalk.dim("   ") + indexStr + chalk.white(time.padEnd(16)) + chalk.white(preview)
  );

  const turns = m.humanTurns + m.assistantTurns;
  const parts: string[] = [];
  parts.push(messageCountContext(turns));
  if (m.toolCalls > 0) parts.push(toolCountContext(m.toolCalls));
  if (m.filesReferenced.length > 0) parts.push(fileCountContext(m.filesReferenced.length));
  if (m.totalCostUSD > 0) parts.push(costWithContext(m.totalCostUSD));
  if (m.errorCount > 0) {
    parts.push(chalk.red(`${m.errorCount} error${m.errorCount === 1 ? "" : "s"}`));
  }

  console.log(
    chalk.dim("   ") + "    " + " ".repeat(16) + parts.join(chalk.dim("  ·  "))
  );
  console.log();
}
