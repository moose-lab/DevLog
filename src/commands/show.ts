import chalk from "chalk";
import ora from "ora";
import { ensureInit } from "../core/config.js";
import { discoverProjects } from "../core/discovery.js";
import { parseSessionFile } from "../core/parser.js";
import type { Session, DevLogEvent } from "../core/types.js";
import {
  formatSmartTime,
  formatCost,
  formatDuration,
  truncate,
} from "../utils/format.js";

interface ShowOptions {
  limit?: string;
}

/**
 * `devlog show <session-id>` — view a full conversation.
 * Accepts partial session IDs (first 6+ chars) for convenience.
 * Also accepts a number (1, 2, 3...) to pick from the most recent sessions.
 */
export async function showCommand(
  sessionRef: string,
  options: ShowOptions
): Promise<void> {
  const { config } = ensureInit();
  const limit = parseInt(options.limit || "50", 10);

  const spinner = ora({
    text: chalk.dim("  Finding session..."),
    spinner: "dots",
    color: "cyan",
  }).start();

  const projects = await discoverProjects(config.claudeDir);
  spinner.stop();

  // Flatten all sessions
  const allSessions: Session[] = [];
  for (const project of projects) {
    allSessions.push(...project.sessions);
  }
  allSessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  if (allSessions.length === 0) {
    console.log();
    console.log(chalk.yellow("  No sessions found."));
    console.log();
    return;
  }

  // Find the session — by number index or by ID prefix
  let session: Session | undefined;

  const asNumber = parseInt(sessionRef, 10);
  if (!isNaN(asNumber) && asNumber >= 1 && asNumber <= allSessions.length) {
    // Numeric reference: "devlog show 1" = most recent session
    session = allSessions[asNumber - 1];
  } else {
    // ID prefix match
    const ref = sessionRef.toLowerCase();
    session = allSessions.find((s) =>
      s.id.toLowerCase().startsWith(ref)
    );
  }

  if (!session) {
    console.log();
    console.log(
      chalk.yellow("  Couldn't find a session matching: ") +
        chalk.white(sessionRef)
    );
    console.log();
    console.log(chalk.dim("  Recent sessions:"));
    const recent = allSessions.slice(0, 5);
    recent.forEach((s, i) => {
      const preview = s.meta.firstUserMessage
        ? truncate(s.meta.firstUserMessage.replace(/\n/g, " ").trim(), 40)
        : "(empty)";
      console.log(
        chalk.cyan(`  ${i + 1}. `) +
          chalk.white(s.projectName.padEnd(14)) +
          chalk.dim(preview) +
          chalk.dim(`  [${s.id.slice(0, 8)}]`)
      );
    });
    console.log();
    console.log(
      chalk.dim("  Use ") +
        chalk.cyan("devlog show 1") +
        chalk.dim(" to view the most recent session.")
    );
    console.log();
    return;
  }

  // Parse the full session
  const parseSpinner = ora({
    text: chalk.dim("  Reading conversation..."),
    spinner: "dots",
    color: "cyan",
  }).start();

  const events = await parseSessionFile(session.filePath, session.id);
  parseSpinner.stop();

  // Render
  renderSessionHeader(session);
  renderConversation(events, limit);
  renderSessionFooter(session, events, limit);
}

function renderSessionHeader(session: Session): void {
  const m = session.meta;
  console.log();
  console.log(
    chalk.bold.cyan("  ▌") +
      chalk.bold.white(` ${session.projectName}`) +
      chalk.dim("  ·  ") +
      chalk.dim(formatSmartTime(session.updatedAt))
  );
  console.log();

  // Session summary in plain language
  const parts: string[] = [];
  const turns = m.humanTurns + m.assistantTurns;
  parts.push(`${turns} messages`);

  if (m.toolCalls > 0) {
    parts.push(`${m.toolCalls} commands run`);
  }
  if (m.filesReferenced.length > 0) {
    parts.push(`${m.filesReferenced.length} files touched`);
  }
  if (m.totalCostUSD > 0) {
    parts.push(`$${m.totalCostUSD.toFixed(3)} cost`);
  }

  console.log(chalk.dim("  " + parts.join("  ·  ")));

  // Show which tools were used
  if (m.uniqueTools.length > 0) {
    console.log(
      chalk.dim("  Tools: ") +
        m.uniqueTools.map((t) => chalk.green(t)).join(chalk.dim(", "))
    );
  }

  console.log();
  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
}

function renderConversation(events: DevLogEvent[], limit: number): void {
  let shown = 0;

  for (const event of events) {
    if (shown >= limit) break;

    if (event.role === "human" && event.type === "text") {
      // User message
      console.log(
        chalk.blue.bold("  You: ") +
          chalk.white(truncate(event.content.trim(), 76))
      );
      console.log();
      shown++;
    } else if (event.role === "assistant" && event.type === "text") {
      // Claude's response — show first few lines
      const lines = event.content.trim().split("\n");
      const preview = lines.slice(0, 3);
      console.log(chalk.dim.bold("  Claude: "));
      for (const line of preview) {
        console.log(chalk.dim("    ") + chalk.white(truncate(line, 74)));
      }
      if (lines.length > 3) {
        console.log(chalk.dim(`    ... (${lines.length - 3} more lines)`));
      }
      console.log();
      shown++;
    } else if (event.role === "tool_use") {
      // Tool call — compact display
      console.log(
        chalk.green("  ⚡ ") +
          chalk.green(event.toolName || "tool") +
          chalk.dim("  ") +
          chalk.dim(truncate(event.content.replace(event.toolName + "(", "").replace(/\)$/, ""), 60))
      );
      shown++;
    } else if (event.role === "tool_result") {
      // Tool result — very compact
      if (event.isError) {
        console.log(
          chalk.red("  ✗ Error: ") +
            chalk.dim(truncate(event.content, 60))
        );
      } else {
        const resultPreview = event.content.trim();
        if (resultPreview.length > 0 && resultPreview.length < 80) {
          console.log(
            chalk.dim("    → ") +
              chalk.dim(truncate(resultPreview, 70))
          );
        }
      }
      // Don't increment shown for tool results (they're part of the tool call)
    }
  }
}

function renderSessionFooter(
  session: Session,
  events: DevLogEvent[],
  limit: number
): void {
  const totalEvents = events.filter(
    (e) =>
      (e.role === "human" && e.type === "text") ||
      (e.role === "assistant" && e.type === "text") ||
      e.role === "tool_use"
  ).length;

  console.log();
  console.log(chalk.dim("  " + "─".repeat(60)));

  if (totalEvents > limit) {
    console.log(
      chalk.dim(`  Showing ${limit} of ${totalEvents} events. Use `) +
        chalk.cyan(`devlog show ${session.id.slice(0, 8)} -n ${totalEvents}`) +
        chalk.dim(" to see all.")
    );
  }

  console.log(
    chalk.dim("  Session ID: ") + chalk.dim(session.id)
  );
  console.log();
}
