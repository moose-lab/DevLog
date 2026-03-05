import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import chalk from "chalk";
import { ensureInit } from "../core/config.js";
import { discoverProjects, computeStats } from "../core/discovery.js";
import { updateCacheFromStats } from "../core/cache.js";

export async function setupStatuslineCommand(): Promise<void> {
  const { config } = ensureInit();

  // 1. Find devlog binary path
  let devlogBin = "devlog";
  try {
    devlogBin = execFileSync("which", ["devlog"], { encoding: "utf-8" }).trim();
  } catch {
    // Fall back to "devlog" and hope it's in PATH
  }

  // 2. Read existing settings
  const claudeSettingsPath = join(homedir(), ".claude", "settings.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(claudeSettingsPath)) {
    try {
      settings = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
    } catch {
      settings = {};
    }
  }

  // 3. Set statusLine config
  settings.statusLine = {
    type: "command",
    command: `${devlogBin} statusline`,
  };

  // 4. Write back
  mkdirSync(dirname(claudeSettingsPath), { recursive: true });
  writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  console.log();
  console.log(chalk.green("  \u2713") + chalk.bold.white(" Claude Code status line configured!"));
  console.log();

  // 5. Warm cache with a full discovery scan
  console.log(chalk.dim("  Warming cache..."));
  try {
    const projects = await discoverProjects(config.claudeDir);
    if (projects.length > 0) {
      updateCacheFromStats(computeStats(projects));
    }
    console.log(chalk.dim("  Cache ready."));
  } catch {
    console.log(chalk.dim("  Cache will be built on first use."));
  }

  console.log();
  console.log(chalk.white("  DevLog will show your daily costs and activity."));
  console.log(chalk.white("  Restart Claude Code to see it."));
  console.log();
}
