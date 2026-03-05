import chalk from "chalk";
import ora from "ora";
import { ensureInit } from "../core/config.js";
import { discoverProjects } from "../core/discovery.js";
import { parseSessionFile } from "../core/parser.js";
import type { Session, DevLogEvent, GlobalOptions, ShowJson } from "../core/types.js";
import {
  formatSmartTime,
  truncate,
  costWithContext,
  messageCountContext,
  toolCountContext,
  fileCountContext,
  humanizeToolSummary,
} from "../utils/format.js";
import { outputJson, isJsonMode, isQuietMode } from "../utils/output.js";

interface ShowOptions {
  limit?: string;
  summary?: boolean;
}

/**
 * `devlog show <session-id>` — view a full conversation.
 * Accepts partial session IDs (first 6+ chars) for convenience.
 * Also accepts a number (1, 2, 3...) to pick from the most recent sessions.
 */
export async function showCommand(
  sessionRef: string,
  options: ShowOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const { config } = ensureInit();
  const limit = parseInt(options.limit || "50", 10);

  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    spinner = ora({
      text: chalk.dim("  Finding session..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const projects = await discoverProjects(config.claudeDir);
  spinner?.stop();

  // Flatten all sessions
  const allSessions: Session[] = [];
  for (const project of projects) {
    allSessions.push(...project.sessions);
  }
  allSessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  if (allSessions.length === 0) {
    if (isJsonMode()) {
      outputJson({ error: "No sessions found" });
      process.exit(1);
    }
    console.log();
    console.log(chalk.yellow("  No sessions found."));
    console.log();
    return;
  }

  // Find the session — by number index or by ID prefix
  let session: Session | undefined;

  const asNumber = parseInt(sessionRef, 10);
  if (!isNaN(asNumber) && asNumber >= 1 && asNumber <= allSessions.length) {
    session = allSessions[asNumber - 1];
  } else {
    const ref = sessionRef.toLowerCase();
    // Try prefix match first, then substring match
    session = allSessions.find((s) =>
      s.id.toLowerCase().startsWith(ref)
    );
    if (!session) {
      session = allSessions.find((s) =>
        s.id.toLowerCase().includes(ref)
      );
    }
  }

  if (!session) {
    if (isJsonMode()) {
      outputJson({ error: `No session matching: ${sessionRef}` });
      process.exit(1);
    }
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
    process.exit(1);
  }

  // Parse the full session
  let parseSpinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode() && !isQuietMode()) {
    parseSpinner = ora({
      text: chalk.dim("  Reading conversation..."),
      spinner: "dots",
      color: "cyan",
      stream: process.stderr,
    }).start();
  }

  const events = await parseSessionFile(session.filePath, session.id);
  parseSpinner?.stop();

  // ── JSON output ────────────────────────────────────
  if (isJsonMode()) {
    const data: ShowJson = {
      session: {
        id: session.id,
        projectName: session.projectName,
        meta: session.meta,
      },
      events: events.map((e) => ({
        timestamp: e.timestamp.toISOString(),
        role: e.role,
        type: e.type,
        content: e.content,
        ...(e.toolName ? { toolName: e.toolName } : {}),
        ...(e.isError ? { isError: e.isError } : {}),
      })),
    };
    outputJson(data);
    return;
  }

  // Render
  if (options.summary) {
    renderSummary(session, events);
  } else {
    renderSessionHeader(session);
    renderConversation(events, limit);
    renderSessionFooter(session, events, limit);
  }
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

  const turns = m.humanTurns + m.assistantTurns;
  const parts: string[] = [];
  parts.push(messageCountContext(turns));
  if (m.toolCalls > 0) parts.push(toolCountContext(m.toolCalls));
  if (m.filesReferenced.length > 0) parts.push(fileCountContext(m.filesReferenced.length));
  if (m.totalCostUSD > 0) parts.push(costWithContext(m.totalCostUSD));

  console.log(chalk.dim("  ") + parts.join(chalk.dim("  ·  ")));

  if (m.uniqueTools.length > 0) {
    console.log(
      chalk.dim("  ") + humanizeToolSummary(m.uniqueTools)
    );
  }

  console.log();
  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
}

function formatToolLine(event: DevLogEvent): string {
  const name = event.toolName || "tool";
  const input = event.toolInput || {};

  if (name === "Read" && input.file_path) return `read ${input.file_path}`;
  if (name === "Write" && input.file_path) return `wrote ${input.file_path}`;
  if (name === "Edit" && input.file_path) return `edited ${input.file_path}`;
  if (name === "Bash" && input.command) return `ran: ${truncate(String(input.command), 60)}`;
  if (name === "Grep" && input.pattern) return `searched for "${truncate(String(input.pattern), 40)}"`;
  if (name === "Glob" && input.pattern) return `found files matching ${truncate(String(input.pattern), 40)}`;

  // Fallback: humanize
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function flushToolGroup(group: DevLogEvent[]): void {
  if (group.length === 0) return;

  const firstName = group[0].toolName || "tool";
  const allSame = group.every((e) => e.toolName === firstName);

  if (allSame && group.length > 2 && (firstName === "Read" || firstName === "Write" || firstName === "Edit")) {
    // Group consecutive same-type file operations
    const verb = firstName === "Read" ? "read" : firstName === "Write" ? "wrote" : "edited";
    const files = group
      .map((e) => {
        const p = String(e.toolInput?.file_path || "");
        return p.split("/").pop() || p;
      })
      .filter(Boolean);
    const fileWord = group.length === 1 ? "file" : "files";
    console.log(
      chalk.green("  ▸ ") +
        chalk.dim(`${verb} ${group.length} ${fileWord}: ${truncate(files.join(", "), 60)}`)
    );
  } else {
    for (const event of group) {
      console.log(
        chalk.green("  ▸ ") + chalk.dim(formatToolLine(event))
      );
    }
  }
}

function renderConversation(events: DevLogEvent[], limit: number): void {
  let shown = 0;
  let toolGroup: DevLogEvent[] = [];

  for (const event of events) {
    if (shown >= limit) break;

    // Flush tool group on non-tool event
    if (event.role !== "tool_use" && event.role !== "tool_result" && toolGroup.length > 0) {
      flushToolGroup(toolGroup);
      toolGroup = [];
    }

    if (event.role === "human" && (event.type === "text" || event.type === "message")) {
      console.log(
        chalk.blue.bold("  You: ") +
          chalk.white(truncate(event.content.trim(), 76))
      );
      console.log();
      shown++;
    } else if (event.role === "assistant" && event.type === "text") {
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
      toolGroup.push(event);
      shown++;
    } else if (event.role === "tool_result") {
      if (event.isError) {
        console.log(
          chalk.red("  ✗ Error: ") +
            chalk.dim(truncate(event.content, 60))
        );
      }
    }
  }

  // Flush remaining tool group
  if (toolGroup.length > 0) {
    flushToolGroup(toolGroup);
  }
}

function renderSessionFooter(
  session: Session,
  events: DevLogEvent[],
  limit: number
): void {
  const totalEvents = events.filter(
    (e) =>
      (e.role === "human" && (e.type === "text" || e.type === "message")) ||
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

  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.cyan(`devlog sessions -p ${session.projectName}`) +
      chalk.dim("  other sessions in this project")
  );
  console.log(
    chalk.dim("  ") +
      chalk.cyan("devlog") +
      chalk.dim("                          back to dashboard")
  );
  console.log();
}

function renderSummary(session: Session, events: DevLogEvent[]): void {
  const m = session.meta;

  console.log();
  console.log(
    chalk.bold.cyan("  ▌") +
      chalk.bold.white(` ${session.projectName}`) +
      chalk.dim("  ·  ") +
      chalk.dim(formatSmartTime(session.updatedAt))
  );
  console.log();

  // Extract what was asked
  const firstMsg = m.firstUserMessage
    ? truncate(m.firstUserMessage.replace(/\n/g, " ").trim(), 70)
    : "(empty)";
  console.log(chalk.white("  Summary:"));
  console.log(
    chalk.dim("  You asked Claude: ") + chalk.white(`"${firstMsg}"`)
  );
  console.log();

  // What happened — group tool usage
  const toolGroups = new Map<string, number>();
  const filesChanged = new Set<string>();
  const commandsRun: string[] = [];
  let errorCount = 0;

  for (const event of events) {
    if (event.role === "tool_use") {
      const name = event.toolName || "tool";
      toolGroups.set(name, (toolGroups.get(name) || 0) + 1);

      const input = event.toolInput || {};
      if (input.file_path && (name === "Write" || name === "Edit")) {
        filesChanged.add(String(input.file_path));
      }
      if (name === "Bash" && input.command) {
        commandsRun.push(truncate(String(input.command), 50));
      }
    }
    if (event.role === "tool_result" && event.isError) {
      errorCount++;
    }
  }

  console.log(chalk.white("  What happened:"));

  for (const [name, count] of toolGroups) {
    let desc: string;
    if (name === "Read") desc = `Read ${count} file${count === 1 ? "" : "s"} to understand the codebase`;
    else if (name === "Write") desc = `Created ${count} file${count === 1 ? "" : "s"}`;
    else if (name === "Edit") desc = `Edited ${count} file${count === 1 ? "" : "s"}`;
    else if (name === "Bash") desc = `Ran ${count} command${count === 1 ? "" : "s"}` + (commandsRun.length > 0 ? ` (${truncate(commandsRun.slice(0, 3).join(", "), 40)})` : "");
    else if (name === "Grep") desc = `Searched code ${count} time${count === 1 ? "" : "s"}`;
    else if (name === "Glob") desc = `Searched for files ${count} time${count === 1 ? "" : "s"}`;
    else desc = `${name} ×${count}`;

    console.log(chalk.dim("  - ") + chalk.dim(desc));
  }

  if (filesChanged.size > 0) {
    const fileNames = [...filesChanged].map((f) => f.split("/").pop() || f);
    console.log(
      chalk.dim("  - ") +
        chalk.dim(`Files changed: ${truncate(fileNames.join(", "), 50)}`)
    );
  }

  if (errorCount > 0) {
    console.log(
      chalk.dim("  - ") +
        chalk.red(`Fixed ${errorCount} error${errorCount === 1 ? "" : "s"}`)
    );
  }

  console.log();

  // Stats line
  const turns = m.humanTurns + m.assistantTurns;
  const parts: string[] = [];
  parts.push(messageCountContext(turns));
  if (m.toolCalls > 0) parts.push(toolCountContext(m.toolCalls));
  if (m.filesReferenced.length > 0) parts.push(fileCountContext(m.filesReferenced.length));
  if (m.totalCostUSD > 0) parts.push(costWithContext(m.totalCostUSD));

  console.log(chalk.dim("  ") + parts.join(chalk.dim("  ·  ")));

  // Footer
  console.log();
  console.log(chalk.dim("  " + "─".repeat(60)));
  console.log();
  console.log(
    chalk.dim("  ") +
      chalk.cyan(`devlog show ${session.id.slice(0, 8)}`) +
      chalk.dim(" see full conversation  ·  ") +
      chalk.cyan(`devlog sessions -p ${session.projectName}`) +
      chalk.dim(" other sessions")
  );
  console.log();
}
