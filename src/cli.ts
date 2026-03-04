import { Command } from "commander";
import chalk from "chalk";
import { dashboardCommand } from "./commands/dashboard.js";
import { initCommand } from "./commands/init.js";
import { sessionsCommand } from "./commands/sessions.js";
import { showCommand } from "./commands/show.js";

const VERSION = "0.1.0";

const HELP_TEXT = `
${chalk.bold.cyan("  ▌")} ${chalk.bold.white("DevLog")} ${chalk.dim(`v${VERSION}`)}
${chalk.dim("  Your Claude Code work journal")}

${chalk.bold.white("  Quick Start:")}
${chalk.dim("  Just run")} ${chalk.cyan("devlog")} ${chalk.dim("— that's it. No setup needed.")}

${chalk.bold.white("  Examples:")}
${chalk.cyan("  devlog")}${chalk.dim("                       See your dashboard")}
${chalk.cyan("  devlog sessions")}${chalk.dim("              Browse all sessions by project")}
${chalk.cyan("  devlog sessions -p chatbot")}${chalk.dim("   Filter to a specific project")}
${chalk.cyan("  devlog show 1")}${chalk.dim("                View your most recent conversation")}
${chalk.cyan("  devlog show abc123")}${chalk.dim("           View a specific session by ID")}
`;

const program = new Command();

program
  .name("devlog")
  .description("Your Claude Code work journal — auto-generated dev logs")
  .version(VERSION)
  .addHelpText("before", HELP_TEXT);

// ── Default: `devlog` with no args → dashboard ──────────
program.action(async () => {
  try {
    await dashboardCommand();
  } catch (err) {
    console.error(
      chalk.red("\n  Error:"),
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }
});

// ── devlog init ──────────────────────────────────────────
program
  .command("init")
  .description("Set up DevLog (usually auto-detected, you rarely need this)")
  .action(async () => {
    try {
      await initCommand();
    } catch (err) {
      console.error(
        chalk.red("\n  Error:"),
        err instanceof Error ? err.message : err
      );
      process.exit(1);
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
    try {
      await sessionsCommand(options);
    } catch (err) {
      console.error(
        chalk.red("\n  Error:"),
        err instanceof Error ? err.message : err
      );
      process.exit(1);
    }
  });

// ── devlog show <session> ────────────────────────────────
program
  .command("show <session>")
  .description("View a full conversation (use a number like 1, 2, 3 or a session ID)")
  .option("-n, --limit <number>", "Max events to display", "50")
  .action(async (sessionRef: string, options) => {
    try {
      await showCommand(sessionRef, options);
    } catch (err) {
      console.error(
        chalk.red("\n  Error:"),
        err instanceof Error ? err.message : err
      );
      process.exit(1);
    }
  });

program.parse();
