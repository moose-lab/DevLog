import chalk from "chalk";
import ora from "ora";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday.js";
import { ensureInit } from "../../core/config.js";
import { discoverProjects } from "../../core/discovery.js";
import type { Session, GlobalOptions } from "../../core/types.js";
import {
  formatSmartTime,
  truncate,
  costWithContext,
  messageCountContext,
  toolCountContext,
  fileCountContext,
} from "../utils/format.js";
import { outputJson, isJsonMode, isQuietMode } from "../utils/output.js";
import { toSessionJson } from "./shared.js";

dayjs.extend(isToday);

export async function todayCommand(globalOpts: GlobalOptions): Promise<void> {
  const { config } = ensureInit();

  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    spinner = ora({
      text: chalk.dim("  Checking today's sessions..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const projects = await discoverProjects(config.claudeDir);
  spinner?.stop();

  // Filter to today's sessions
  const todaySessions: Session[] = [];
  const projectNames = new Set<string>();

  for (const project of projects) {
    for (const session of project.sessions) {
      if (dayjs(session.updatedAt).isToday()) {
        todaySessions.push(session);
        projectNames.add(session.projectName);
      }
    }
  }

  todaySessions.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

  // JSON output
  if (isJsonMode()) {
    const totalCost = todaySessions.reduce((s, sess) => s + sess.meta.totalCostUSD, 0);
    const totalTools = todaySessions.reduce((s, sess) => s + sess.meta.toolCalls, 0);
    const allFiles = new Set<string>();
    for (const s of todaySessions) {
      for (const f of s.meta.filesReferenced) allFiles.add(f);
    }

    outputJson({
      date: dayjs().format("YYYY-MM-DD"),
      sessionCount: todaySessions.length,
      projectCount: projectNames.size,
      totalCostUSD: Math.round(totalCost * 1000000) / 1000000,
      totalToolCalls: totalTools,
      totalFilesTouched: allFiles.size,
      sessions: todaySessions.map(toSessionJson),
    });
    return;
  }

  // No sessions today
  if (todaySessions.length === 0) {
    console.log();
    console.log(
      chalk.bold.cyan("  ▌") + chalk.bold.white(" Your day so far")
    );
    console.log();
    console.log(chalk.dim("  No sessions yet today."));

    // Find most recent session
    const allSessions: Session[] = [];
    for (const p of projects) allSessions.push(...p.sessions);
    allSessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    if (allSessions.length > 0) {
      const last = allSessions[0];
      console.log(
        chalk.dim("  Your last session was ") +
          chalk.white(formatSmartTime(last.updatedAt)) +
          chalk.dim(" in ") +
          chalk.cyan(last.projectName)
      );
    }

    console.log();
    console.log(
      chalk.dim("  ") +
        chalk.cyan("devlog sessions") +
        chalk.dim(" browse all  ·  ") +
        chalk.cyan("devlog") +
        chalk.dim(" dashboard")
    );
    console.log();
    return;
  }

  // Narrative summary
  const totalCost = todaySessions.reduce((s, sess) => s + sess.meta.totalCostUSD, 0);
  const totalTools = todaySessions.reduce((s, sess) => s + sess.meta.toolCalls, 0);
  const allFiles = new Set<string>();
  for (const s of todaySessions) {
    for (const f of s.meta.filesReferenced) allFiles.add(f);
  }

  const sessionWord = todaySessions.length === 1 ? "conversation" : "conversations";
  const projectWord = projectNames.size === 1 ? "project" : "projects";

  console.log();
  console.log(
    chalk.bold.cyan("  ▌") + chalk.bold.white(" Your day so far")
  );
  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.white(`${todaySessions.length} ${sessionWord} across ${projectNames.size} ${projectWord}.`)
  );

  const summaryParts: string[] = [];
  if (totalTools > 0) summaryParts.push(toolCountContext(totalTools));
  if (allFiles.size > 0) summaryParts.push(fileCountContext(allFiles.size));
  if (summaryParts.length > 0) {
    console.log(chalk.dim("  ") + chalk.white("Claude ") + summaryParts.join(chalk.dim(" and ")));
  }
  if (totalCost > 0) {
    console.log(chalk.dim("  Cost: ") + costWithContext(totalCost));
  }

  console.log();
  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();

  // Timeline
  for (const session of todaySessions) {
    const m = session.meta;
    const time = formatSmartTime(session.updatedAt);
    const preview = m.firstUserMessage
      ? truncate(m.firstUserMessage.replace(/\n/g, " ").trim(), 42)
      : chalk.dim("(empty)");

    console.log(
      chalk.dim("  ") +
        chalk.white(time.padEnd(12)) +
        chalk.cyan(session.projectName.padEnd(14)) +
        chalk.white(`"${preview}"`)
    );

    const turns = m.humanTurns + m.assistantTurns;
    const parts: string[] = [];
    parts.push(messageCountContext(turns));
    if (m.toolCalls > 0) parts.push(toolCountContext(m.toolCalls));
    if (m.totalCostUSD > 0) parts.push(costWithContext(m.totalCostUSD));

    console.log(
      chalk.dim("  ") +
        " ".repeat(26) +
        parts.join(chalk.dim("  ·  "))
    );
    console.log();
  }

  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.cyan("devlog show 1") +
      chalk.dim(" view most recent  ·  ") +
      chalk.cyan("devlog sessions") +
      chalk.dim(" browse all")
  );
  console.log();
}
