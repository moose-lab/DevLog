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

interface HookCommand {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

export interface HookEntry {
  matcher?: string;
  hooks?: HookCommand[];
  /** Legacy flat shape written by older devlog versions. */
  type?: string;
  command?: string;
  [key: string]: unknown;
}

const STATUS_EVENTS = [
  ["PreToolUse", "running"],
  ["PostToolUse", "done"],
  ["Stop", "idle"],
] as const;

function makeStatusHookCommand(state: string): string {
  return `bash -c 'echo "{\\"state\\":\\"${state}\\",\\"ts\\":$(date +%s)}" > ~/.claude-status.tmp && mv ~/.claude-status.tmp ~/.claude-status'`;
}

function isDevlogStatusEntry(entry: HookEntry): boolean {
  if (entry.command?.includes(".claude-status")) return true;
  return Boolean(
    Array.isArray(entry.hooks) &&
      entry.hooks.some((hook) => hook.command?.includes(".claude-status")),
  );
}

/**
 * Installs the devlog status hooks in Claude Code's matcher-wrapped hook
 * schema (IM-17). Older devlog versions wrote flat {type, command} entries
 * that Claude Code never executed — the tmux/status indicator sat idle
 * forever. Existing devlog entries (either shape) are replaced in place;
 * user-defined entries are preserved untouched.
 */
export function upsertDevlogStatusHooks(settings: ClaudeSettings): void {
  const hooks =
    settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks)
      ? (settings.hooks as Record<string, HookEntry[] | undefined>)
      : {};

  for (const [event, state] of STATUS_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? hooks[event]! : [];
    const kept = existing.filter((entry) => !isDevlogStatusEntry(entry));
    const entry: HookEntry = {
      hooks: [{ type: "command", command: makeStatusHookCommand(state) }],
    };
    if (event !== "Stop") {
      entry.matcher = "*";
    }
    kept.push(entry);
    hooks[event] = kept;
  }

  settings.hooks = hooks;
}
