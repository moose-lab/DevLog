import chalk from "chalk";
import ora from "ora";
import { existsSync } from "fs";
import { ensureInit } from "../../core/config.js";
import {
  discoverProjects,
  computeStats,
  groupSessionsByTime,
} from "../../core/discovery.js";
import type { Session, AggregateStats, GlobalOptions, DashboardJson } from "../../core/types.js";
import {
  formatSmartTime,
  formatNumber,
  truncate,
  costWithContext,
  messageCountContext,
  toolCountContext,
  fileCountContext,
} from "../utils/format.js";
import { getClaudeProjectsDir } from "../../core/paths.js";
import { outputJson, isJsonMode, isQuietMode } from "../utils/output.js";
import { toSessionJson } from "./shared.js";
import { updateCacheFromStats } from "../../core/cache.js";

const VERSION = "0.4.0";

/**
 * The default command. This IS the product.
 * Run `devlog` → see your world with Claude.
 */
export async function dashboardCommand(globalOpts: GlobalOptions): Promise<void> {
  const { config, isFirstRun } = ensureInit();

  // ── No Claude Code installed ──────────────────────
  if (!existsSync(config.claudeDir)) {
    if (isJsonMode()) {
      outputJson({ error: "Claude Code not found", path: getClaudeProjectsDir() });
      process.exit(1);
    }
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
  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    spinner = ora({
      text: chalk.dim("  Reading your Claude Code history..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const projects = await discoverProjects(config.claudeDir, (msg) => {
    if (spinner) spinner.text = chalk.dim(`  ${msg}`);
  });

  spinner?.stop();

  // ── No sessions yet ───────────────────────────────
  if (projects.length === 0) {
    if (isJsonMode()) {
      outputJson({ version: VERSION, timestamp: new Date().toISOString(), summary: "No sessions found", stats: { totalProjects: 0, totalSessions: 0, totalToolCalls: 0, totalFilesTouched: 0, totalCostUSD: 0, todaySessions: 0, todayCostUSD: 0 }, recentSessions: [] });
      return;
    }
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
  updateCacheFromStats(stats);
  const groups = groupSessionsByTime(projects);

  // ── JSON output ────────────────────────────────────
  if (isJsonMode()) {
    const allSessions = projects.flatMap((p) => p.sessions);
    allSessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const recent = allSessions.slice(0, 10);

    const projectWord = stats.totalProjects === 1 ? "project" : "projects";
    const sessionWord = stats.totalSessions === 1 ? "conversation" : "conversations";

    const data: DashboardJson = {
      version: VERSION,
      timestamp: new Date().toISOString(),
      summary: `You and Claude had ${stats.totalSessions} ${sessionWord} across ${stats.totalProjects} ${projectWord}`,
      stats: {
        totalProjects: stats.totalProjects,
        totalSessions: stats.totalSessions,
        totalToolCalls: stats.totalToolCalls,
        totalFilesTouched: stats.allFilesReferenced.length,
        totalCostUSD: Math.round(stats.totalCostUSD * 1000000) / 1000000,
        todaySessions: stats.todaySessions,
        todayCostUSD: Math.round(stats.todayCostUSD * 1000000) / 1000000,
      },
      recentSessions: recent.map(toSessionJson),
    };
    outputJson(data);
    return;
  }

  // ── Render ────────────────────────────────────────
  console.log();

  if (!isQuietMode()) {
    if (isFirstRun) {
      renderWelcome(stats);
    } else {
      renderBanner();
    }
  }

  renderNarrativeStats(stats);
  renderSessionGroups(groups, stats);

  if (!isQuietMode()) {
    renderNextSteps(stats, isFirstRun);
  }
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

  const timeStr = time.length > 14 ? time.slice(0, 14) : time;
  console.log(
    chalk.dim("  ") +
      accentColor(timeStr.padEnd(16)) +
      chalk.bold.white(session.projectName.padEnd(14)) +
      chalk.white(preview)
  );

  const turns = m.humanTurns + m.assistantTurns;
  const parts: string[] = [];
  parts.push(messageCountContext(turns));
  if (m.toolCalls > 0) parts.push(toolCountContext(m.toolCalls));
  if (m.filesReferenced.length > 0) parts.push(fileCountContext(m.filesReferenced.length));
  if (m.totalCostUSD > 0) parts.push(costWithContext(m.totalCostUSD));
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
    console.log(chalk.white("  What you can do next:"));
    console.log();
    console.log(
      chalk.cyan("  devlog today") +
        chalk.dim("               What did I do today?")
    );
    console.log(
      chalk.cyan("  devlog sessions") +
        chalk.dim("            Browse all sessions by project")
    );
    console.log(
      chalk.cyan("  devlog show <id>") +
        chalk.dim("           View a full conversation")
    );
    console.log(
      chalk.cyan("  devlog search \"auth\"") +
        chalk.dim("      Find a conversation")
    );
    console.log();
    console.log(
      chalk.dim("  Tip: Just run ") +
        chalk.cyan("devlog") +
        chalk.dim(" anytime to see this dashboard.")
    );
  } else {
    console.log(
      chalk.dim("  ") +
        chalk.cyan("devlog today") +
        chalk.dim(" today  ·  ") +
        chalk.cyan("devlog sessions") +
        chalk.dim(" all  ·  ") +
        chalk.cyan("devlog show <id>") +
        chalk.dim(" view  ·  ") +
        chalk.cyan("devlog search") +
        chalk.dim(" find")
    );
  }
  console.log();
}
