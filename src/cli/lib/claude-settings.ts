import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export type ClaudeSettings = Record<string, unknown>;

function isFileMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Reads ~/.claude/settings.json without destroying it (IM-18). A parse
 * failure used to fall back to `{}` and the setup commands then overwrote
 * the user's file with a devlog-only object — corrupt settings must abort
 * instead, and writes keep a .bak of the previous content.
 */
export function loadClaudeSettings(
  path: string,
):
  | { ok: true; settings: ClaudeSettings }
  | { ok: false; error: string } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if (isFileMissing(err)) {
      return { ok: true, settings: {} };
    }
    return {
      ok: false,
      error: `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, settings: parsed as ClaudeSettings };
    }
    return { ok: false, error: `${path} is not a JSON object` };
  } catch (err) {
    return {
      ok: false,
      error: `Could not parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function writeClaudeSettingsWithBackup(
  path: string,
  settings: ClaudeSettings,
): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    copyFileSync(path, `${path}.bak`);
  } catch (err) {
    // No existing file means nothing to back up.
    if (!isFileMissing(err)) throw err;
  }
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}
