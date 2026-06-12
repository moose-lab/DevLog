import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export type ClaudeSettings = Record<string, unknown>;

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
  if (!existsSync(path)) {
    return { ok: true, settings: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
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
  if (existsSync(path)) {
    copyFileSync(path, `${path}.bak`);
  }
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}
