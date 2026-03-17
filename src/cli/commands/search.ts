import chalk from "chalk";
import ora from "ora";
import { ensureInit } from "../../core/config.js";
import { discoverProjects } from "../../core/discovery.js";
import type { Session, GlobalOptions } from "../../core/types.js";
import {
  formatSmartTime,
  truncate,
  costWithContext,
  messageCountContext,
} from "../utils/format.js";
import { outputJson, isJsonMode, isQuietMode } from "../utils/output.js";
import { toSessionJson } from "./shared";

export async function searchCommand(
  query: string,
  globalOpts: GlobalOptions
): Promise<void> {
  const { config } = ensureInit();

  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    spinner = ora({
      text: chalk.dim("  Searching sessions..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const projects = await discoverProjects(config.claudeDir);
  spinner?.stop();

  const q = query.toLowerCase();

  // Search by first message, project name, or tool names
  const matches: Session[] = [];
  for (const project of projects) {
    for (const session of project.sessions) {
      const m = session.meta;
      if (
        session.projectName.toLowerCase().includes(q) ||
        m.firstUserMessage.toLowerCase().includes(q) ||
        m.uniqueTools.some((t) => t.toLowerCase().includes(q))
      ) {
        matches.push(session);
      }
    }
  }

  matches.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  // JSON output
  if (isJsonMode()) {
    outputJson({
      query,
      matchCount: matches.length,
      sessions: matches.map(toSessionJson),
    });
    return;
  }

  console.log();
  console.log(
    chalk.bold.cyan("  ▌") +
      chalk.bold.white(` Search: `) +
      chalk.white(`"${query}"`)
  );
  console.log();

  if (matches.length === 0) {
    console.log(chalk.dim("  No conversations found matching that query."));
    console.log();
    console.log(
      chalk.dim("  Try a shorter term, or use ") +
        chalk.cyan("devlog sessions") +
        chalk.dim(" to browse all.")
    );
    console.log();
    return;
  }

  const matchWord = matches.length === 1 ? "conversation" : "conversations";
  console.log(
    chalk.dim(`  Found ${matches.length} ${matchWord} matching "${query}"`)
  );
  console.log();

  const shown = matches.slice(0, 20);

  for (let i = 0; i < shown.length; i++) {
    const session = shown[i];
    const m = session.meta;
    const time = formatSmartTime(session.updatedAt);
    const preview = m.firstUserMessage
      ? truncate(m.firstUserMessage.replace(/\n/g, " ").trim(), 42)
      : chalk.dim("(empty)");

    console.log(
      chalk.dim(`  ${(i + 1).toString().padEnd(3)} `) +
        chalk.white(time.padEnd(16)) +
        chalk.cyan(session.projectName.padEnd(14)) +
        chalk.white(`"${preview}"`)
    );

    const turns = m.humanTurns + m.assistantTurns;
    const parts: string[] = [];
    parts.push(messageCountContext(turns));
    if (m.totalCostUSD > 0) parts.push(costWithContext(m.totalCostUSD));

    console.log(
      chalk.dim("  ") +
        "    " +
        " ".repeat(16) +
        parts.join(chalk.dim("  ·  "))
    );
    console.log();
  }

  if (matches.length > 20) {
    console.log(chalk.dim(`  + ${matches.length - 20} more matches`));
    console.log();
  }

  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.cyan("devlog show 1") +
      chalk.dim(" view match  ·  ") +
      chalk.cyan(`devlog search "${query} ..."`) +
      chalk.dim(" refine")
  );
  console.log();
}
