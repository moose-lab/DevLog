import { Command } from "commander";
import chalk from "chalk";
import { dashboardCommand } from "./commands/dashboard.js";
import { initCommand } from "./commands/init.js";
import { sessionsCommand } from "./commands/sessions.js";
import { showCommand } from "./commands/show.js";
import { todayCommand } from "./commands/today.js";
import { searchCommand } from "./commands/search.js";
import { statsCommand } from "./commands/stats.js";
import { costCommand } from "./commands/cost.js";
import { statuslineCommand } from "./commands/statusline.js";
import { setupStatuslineCommand } from "./commands/setup-statusline.js";
import { setupTmuxCommand } from "./commands/setup-tmux.js";
import { initOutput, outputJson } from "./utils/output.js";
import { levenshtein } from "./utils/format.js";
import type { GlobalOptions } from "./core/types.js";

const VERSION = "0.4.0";

const HELP_TEXT = `
${chalk.bold.cyan("  ▌")} ${chalk.bold.white("DevLog")} ${chalk.dim(`v${VERSION}`)}
${chalk.dim("  Your Claude Code work journal")}

${chalk.bold.white("  Quick Start:")}
${chalk.dim("  Just run")} ${chalk.cyan("devlog")} ${chalk.dim("— that's it. No setup needed.")}

${chalk.bold.white("  Examples:")}
${chalk.cyan("  devlog")}${chalk.dim("                       See your dashboard")}
${chalk.cyan("  devlog today")}${chalk.dim("                 What did I do today?")}
${chalk.cyan("  devlog sessions")}${chalk.dim("              Browse all sessions by project")}
${chalk.cyan("  devlog sessions -p chatbot")}${chalk.dim("   Filter to a specific project")}
${chalk.cyan("  devlog show 1")}${chalk.dim("                View your most recent conversation")}
${chalk.cyan("  devlog show 1 --summary")}${chalk.dim("      Quick narrative summary")}
${chalk.cyan("  devlog show abc123")}${chalk.dim("           View a specific session by ID")}
${chalk.cyan("  devlog search \"auth bug\"")}${chalk.dim("    Find a conversation")}
${chalk.cyan("  devlog stats")}${chalk.dim("                 Usage trends")}
${chalk.cyan("  devlog cost")}${chalk.dim("                  Cost breakdown")}

${chalk.bold.white("  Agent Integration:")}
${chalk.cyan("  devlog setup-statusline")}${chalk.dim("        Configure Claude Code status bar")}
${chalk.cyan("  devlog statusline")}${chalk.dim("             Output status line (used by Claude Code)")}

${chalk.bold.white("  Output Modes:")}
${chalk.cyan("  devlog --json")}${chalk.dim("                JSON output for scripts/agents")}
${chalk.cyan("  devlog -q")}${chalk.dim("                    Quiet mode (no spinners/banners)")}
${chalk.cyan("  devlog --no-color")}${chalk.dim("            Plain text, no ANSI escapes")}
`;

const program = new Command();

const KNOWN_COMMANDS = [
  "init",
  "sessions",
  "show",
  "today",
  "search",
  "stats",
  "cost",
  "statusline",
  "setup-statusline",
  "setup-tmux",
];

function getGlobalOpts(): GlobalOptions {
  const opts = program.opts();
  return { json: !!opts.json, quiet: !!opts.quiet };
}

function handleError(err: unknown, globalOpts: GlobalOptions): never {
  const message = err instanceof Error ? err.message : String(err);
  if (globalOpts.json) {
    outputJson({ error: message });
  } else {
    console.error(
      chalk.red("\n  Error:"),
      message
    );
  }
  process.exit(1);
}

program
  .name("devlog")
  .description("Your Claude Code work journal — auto-generated dev logs")
  .version(VERSION)
  .option("--json", "Output as JSON for scripts and agents")
  .option("-q, --quiet", "Suppress non-essential output")
  .option("--no-color", "Disable colored output")
  .addHelpText("before", HELP_TEXT);

// Initialize output context before every command
program.hook("preAction", () => {
  const opts = program.opts();
  if (opts.color === false) {
    process.env.NO_COLOR = "1";
  }
  initOutput({ json: !!opts.json, quiet: !!opts.quiet });
});

// ── Default: `devlog` with no args → dashboard ──────────
program.action(async () => {
  const globalOpts = getGlobalOpts();
  try {
    await dashboardCommand(globalOpts);
  } catch (err) {
    handleError(err, globalOpts);
  }
});

// ── devlog init ──────────────────────────────────────────
program
  .command("init")
  .description("Set up DevLog (usually auto-detected, you rarely need this)")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    try {
      await initCommand(globalOpts);
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── devlog sessions ──────────────────────────────────────
program
  .command("sessions")
  .description("Browse all sessions grouped by project")
  .option("-p, --project <name>", "Filter by project name (fuzzy match)")
  .option("-n, --limit <number>", "Max sessions to display", "30")
  .option("-a, --all", "Show all sessions")
  .action(async (options) => {
    const globalOpts = getGlobalOpts();
    try {
      await sessionsCommand(options, globalOpts);
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── devlog show <session> ────────────────────────────────
program
  .command("show <session>")
  .description("View a full conversation (use a number like 1, 2, 3 or a session ID)")
  .option("-n, --limit <number>", "Max events to display", "50")
  .option("-s, --summary", "Show a narrative summary instead of the full conversation")
  .action(async (sessionRef: string, options) => {
    const globalOpts = getGlobalOpts();
    try {
      await showCommand(sessionRef, options, globalOpts);
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── devlog today ─────────────────────────────────────────
program
  .command("today")
  .description("What did I do today?")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    try {
      await todayCommand(globalOpts);
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── devlog search <query> ────────────────────────────────
program
  .command("search <query>")
  .description("Search sessions by message, project, or tool name")
  .action(async (query: string) => {
    const globalOpts = getGlobalOpts();
    try {
      await searchCommand(query, globalOpts);
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── devlog stats ─────────────────────────────────────────
program
  .command("stats")
  .description("Aggregated usage statistics")
  .option("--period <period>", "Filter: today, week, month, all", "all")
  .action(async (options) => {
    const globalOpts = getGlobalOpts();
    try {
      await statsCommand(options, globalOpts);
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── devlog cost ──────────────────────────────────────────
program
  .command("cost")
  .description("Cost breakdown by project and model")
  .option("--period <period>", "Filter: today, week, month, all", "all")
  .action(async (options) => {
    const globalOpts = getGlobalOpts();
    try {
      await costCommand(options, globalOpts);
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── devlog statusline ───────────────────────────────────
program
  .command("statusline")
  .description("Output status line for Claude Code integration")
  .option("--no-cache", "Force refresh, skip cache")
  .action(async (options) => {
    try {
      await statuslineCommand(options);
    } catch {
      // Silent failure — status line must never crash
    }
  });

// ── devlog setup-statusline ─────────────────────────────
program
  .command("setup-statusline")
  .description("Configure Claude Code status bar integration")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    try {
      await setupStatuslineCommand();
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── devlog setup-tmux ───────────────────────────────────
program
  .command("setup-tmux")
  .description("Configure tmux status bar with cost dashboard")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    try {
      await setupTmuxCommand();
    } catch (err) {
      handleError(err, globalOpts);
    }
  });

// ── "Did you mean?" for unknown commands (Principle 3) ───
// Commander treats unknown words as args to default command.
// We intercept by checking process.argv before parse.
const userArgs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (userArgs.length === 1 && !KNOWN_COMMANDS.includes(userArgs[0])) {
  // Check if it looks like a mistyped command (not a session ID or number)
  const candidate = userArgs[0];
  const isNumber = /^\d+$/.test(candidate);
  const isSessionId = /^[0-9a-f]{6,}$/i.test(candidate);

  if (!isNumber && !isSessionId) {
    let suggestion = "";
    let bestDist = Infinity;

    for (const cmd of KNOWN_COMMANDS) {
      const dist = levenshtein(candidate, cmd);
      if (dist < bestDist) {
        bestDist = dist;
        suggestion = cmd;
      }
    }

    if (bestDist <= 3) {
      console.error();
      console.error(
        chalk.yellow(`  Unknown command: ${candidate}`)
      );
      console.error(
        chalk.dim("  Did you mean: ") + chalk.cyan(suggestion) + chalk.dim("?")
      );
      console.error(
        chalk.dim("  Run ") +
          chalk.cyan("devlog --help") +
          chalk.dim(" to see all commands.")
      );
      console.error();
      process.exit(1);
    }
  }
}

program.parse();
