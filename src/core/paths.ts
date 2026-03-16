import { homedir } from "os";
import { join } from "path";

/**
 * Default Claude Code projects directory
 */
export function getClaudeProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

/**
 * Default DevLog data directory
 */
export function getDevlogDir(): string {
  return join(homedir(), ".devlog");
}

/**
 * Default DevLog config file path
 */
export function getConfigPath(): string {
  return join(getDevlogDir(), "config.toml");
}

/**
 * Decode Claude Code's path encoding:
 *   -Users-dong-projects-myapp → /Users/dong/projects/myapp
 *
 * Claude Code encodes the project path by replacing '/' with '-'
 * and prepending a '-' to the path.
 */
export function decodePath(encoded: string): string {
  // The encoded path starts with the drive/root indicator
  // e.g., "-Users-dong-xxx" → "/Users/dong/xxx"
  // Handle both macOS and Linux paths
  if (encoded.startsWith("-")) {
    return encoded.replace(/-/g, "/");
  }
  return encoded;
}

/**
 * Get a human-readable project name from the decoded path
 */
export function getProjectName(decodedPath: string): string {
  const parts = decodedPath.split("/").filter(Boolean);
  // Return the last meaningful directory name
  return parts[parts.length - 1] || decodedPath;
}
