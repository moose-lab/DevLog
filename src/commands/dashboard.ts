import chalk from "chalk";
import ora from "ora";
import { existsSync } from "fs";
import { ensureInit } from "../core/config.js";
import {
  discoverProjects,
  computeStats,
  groupSessionsByTime,
} from "../core/discovery.js";
import type { Session, AggregateStats } from "../core/types.js";
import {
  formatSmartTime,
  formatCost,
  formatDuration,
  formatNumber,
  truncate,
} from "../utils/format.js";
import { getClaudeProjectsDir } from "../utils/paths.js";

/**
 * The default command. This IS the product.
 * Run `devlog` → see your world with Claude.
 */
export async function dashboardCommand(): Promise<void> {
  const { config, isFirstRun } = ensureInit();

  // ── No Claude Code installed ──────────────────────
  if (!existsSync(config.claudeDir)) {
    console.log();
    console.log(
      chalk.bold.cyan("  ▌") + chalk.bold.white(" DevLog")
    );
    console.log();
    console.log(
      chalk.white("  Hmm, I can't find Claude Code on this machine.")
    );
    console.log(
      chalk.dim("  I looked for: ") + chalk.white(getClaudeProjectsDir())
    );
    console.log();
    console.log(
      chalk.white("  To get started:")
    );
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

  // ── Scan ──────────────────────────────────────────
  const spinner = ora({
    text: chalk.dim("  Reading your Claude Code history..."),
    spinner: "dots",
    color: "cyan",
  }).start();

  const projects = await discoverProjects(config.claudeDir, (msg) => {
    spinner.text = chalk.dim(`  ${msg}`);
  });

  spinner.stop();

  // ── No sessions yet ───────────────────────────────
  if (projects.length === 0) {
    console.log();
    console.log(
      chalk.bold.cyan("  ▌") + chalk.bold.white(" DevLog")
    );
    console.log();
    console.log(
      chalk.white("  No conversations found yet.")
    );
    console.log(
      chalk.dim("  Start a Claude Code session in any project, then come back!")
    );
    console.log();
    return;
  }

  const stats = computeStats(projects);
  const groups = groupSessionsByTime(projects);

  // ── Render ────────────────────────────────────────
  console.log();

  if (isFirstRun) {
    renderWelcome(stats);
  } else {
    renderBanner();
  }

  renderNarrativeStats(stats);
  renderSessionGroups(groups, stats);
  renderNextSteps(stats, isFirstRun);
}

// ─────────────────────────────────────────────────────
// Render helpers
// ─────────────────────────────────────────────────────

function renderWelcome(stats: AggregateStats): void {
  console.log(
    chalk.bold.cyan("  ▌") + chalk.bold.white(" Welcome to DevLog!")
  );
  console.log();
  console.log(
    chalk.white("  I found your Claude Code history — let me show you what") +
    chalk.white(" you've been building.")
  );
  console.log();
}

function renderBanner(): void {
  console.log(
    chalk.bold.cyan("  ▌") +
      chalk.bold.white(" DevLog")
  );
  console.log();
}

function renderNarrativeStats(stats: AggregateStats): void {
  // Main narrative: "You and Claude" story
  const projectWord = stats.totalProjects === 1 ? "project" : "projects";
  const sessionWord = stats.totalSessions === 1 ? "conversation" : "conversations";

  console.log(
    chalk.dim("  ") +
      chalk.white("You and Claude had ") +
      chalk.cyan.bold(String(stats.totalSessions)) +
      chalk.white(` ${sessionWord} across `) +
      chalk.cyan.bold(String(stats.totalProjects)) +
      chalk.white(` ${projectWord}.`)
  );

  // Activity line — what actually happened
  const activityParts: string[] = [];

  if (stats.totalToolCalls > 0) {
    activityParts.push(
      chalk.white("Claude ran ") +
        chalk.green.bold(formatNumber(stats.totalToolCalls)) +
        chalk.white(" commands")
    );
  }

  if (stats.allFilesReferenced.length > 0) {
    activityParts.push(
      chalk.white("touched ") +
        chalk.blue.bold(String(stats.allFilesReferenced.length)) +
        chalk.white(" files")
    );
  }

  if (activityParts.length > 0) {
    console.log(chalk.dim("  ") + activityParts.join(chalk.dim(" and ")));
  }

  // Cost line — only if there's data, with context
  if (stats.totalCostUSD > 0) {
    const costStr = stats.totalCostUSD < 1
      ? `$${stats.totalCostUSD.toFixed(3)}`
      : `$${stats.totalCostUSD.toFixed(2)}`;

    let costContext = "";
    if (stats.totalCostUSD < 0.10) costContext = " — less than a cup of coffee";
    else if (stats.totalCostUSD < 1) costContext = " — pretty efficient";
    else if (stats.totalCostUSD < 5) costContext = " — solid investment";

    console.log(
      chalk.dim("  ") +
        chalk.white("Total cost: ") +
        chalk.yellow.bold(costStr) +
        chalk.dim(costContext)
    );
  }

  // Today highlight
  if (stats.todaySessions > 0) {
    const todayWord = stats.todaySessions === 1 ? "session" : "sessions";
    console.log(
      chalk.dim("  ") +
        chalk.green("▸ ") +
        chalk.white.bold(`${stats.todaySessions} ${todayWord} today`) +
        (stats.todayCostUSD > 0
          ? chalk.dim(` · $${stats.todayCostUSD.toFixed(3)}`)
          : "")
    );
  }

  console.log();
  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
}

function renderSessionGroups(
  groups: {
    today: Session[];
    yesterday: Session[];
    thisWeek: Session[];
    older: Session[];
  },
  stats: AggregateStats
): void {
  const hasToday = groups.today.length > 0;
  const hasYesterday = groups.yesterday.length > 0;
  const hasThisWeek = groups.thisWeek.length > 0;
  const hasOlder = groups.older.length > 0;

  if (hasToday) {
    renderGroup("Today", groups.today, chalk.green);
  }

  if (hasYesterday) {
    renderGroup("Yesterday", groups.yesterday, chalk.blue);
  }

  if (hasThisWeek) {
    renderGroup("This Week", groups.thisWeek, chalk.white);
  }

  if (hasOlder) {
    const count = groups.older.length;
    console.log(
      chalk.dim(`  + ${count} older session${count === 1 ? "" : "s"}`)
    );
    console.log();
  }

  if (!hasToday && !hasYesterday && !hasThisWeek && !hasOlder) {
    console.log(chalk.dim("  No sessions found."));
    console.log();
  }
}

function renderGroup(
  label: string,
  sessions: Session[],
  accentColor: typeof chalk
): void {
  console.log(accentColor.bold(`  ${label}`));
  console.log();

  for (const session of sessions) {
    renderSessionCard(session, accentColor);
  }
}

function renderSessionCard(session: Session, accentColor: typeof chalk): void {
  const m = session.meta;
  const time = formatSmartTime(session.updatedAt);
  const preview = m.firstUserMessage
    ? truncate(m.firstUserMessage.replace(/\n/g, " ").trim(), 50)
    : chalk.dim("(empty session)");

  // Line 1: Time + Project name + What you asked
  const timeStr = time.length > 14 ? time.slice(0, 14) : time;
  console.log(
    chalk.dim("  ") +
      accentColor(timeStr.padEnd(16)) +
      chalk.bold.white(session.projectName.padEnd(14)) +
      chalk.white(preview)
  );

  // Line 2: Human-readable activity summary
  const parts: string[] = [];

  // Conversation depth
  const turns = m.humanTurns + m.assistantTurns;
  if (turns <= 4) {
    parts.push(chalk.dim("quick chat"));
  } else if (turns <= 10) {
    parts.push(chalk.dim(`${turns} messages`));
  } else {
    parts.push(chalk.white(`${turns} messages`));
  }

  // What Claude did (in plain language)
  if (m.toolCalls > 0) {
    parts.push(chalk.green(`ran ${m.toolCalls} commands`));
  }

  if (m.filesReferenced.length > 0) {
    const fileWord = m.filesReferenced.length === 1 ? "file" : "files";
    parts.push(chalk.blue(`wrote ${m.filesReferenced.length} ${fileWord}`));
  }

  if (m.totalCostUSD > 0) {
    parts.push(formatCost(m.totalCostUSD));
  }

  if (m.errorCount > 0) {
    const errWord = m.errorCount === 1 ? "error" : "errors";
    parts.push(chalk.red(`${m.errorCount} ${errWord}`));
  }

  console.log(
    chalk.dim("  ") +
      " ".repeat(30) +
      parts.join(chalk.dim("  ·  "))
  );
  console.log();
}

function renderNextSteps(stats: AggregateStats, isFirstRun: boolean): void {
  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();

  if (isFirstRun) {
    // First run: teach the user what they can do
    console.log(chalk.white("  What you can do next:"));
    console.log();
    console.log(
      chalk.cyan("  devlog sessions") +
        chalk.dim("            Browse all sessions by project")
    );
    console.log(
      chalk.cyan("  devlog sessions -p chat") +
        chalk.dim("    Filter to a specific project")
    );
    console.log(
      chalk.cyan("  devlog show <id>") +
        chalk.dim("           View a full conversation")
    );
    console.log();
    console.log(
      chalk.dim("  Tip: Just run ") +
        chalk.cyan("devlog") +
        chalk.dim(" anytime to see this dashboard.")
    );
  } else {
    // Returning user: compact hints
    console.log(
      chalk.dim("  ") +
        chalk.cyan("devlog sessions") +
        chalk.dim(" all sessions  ·  ") +
        chalk.cyan("devlog show <id>") +
        chalk.dim(" view conversation  ·  ") +
        chalk.cyan("--help")
    );
  }
  console.log();
}
