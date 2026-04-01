import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { getClaudeProjectsDir } from "./paths";

const execFileAsync = promisify(execFile);

export interface VccOutput {
  full: string;
  brief: string;
  search: string;
}

const EMPTY: VccOutput = { full: "", brief: "", search: "" };

// In-memory cache: key = "sessionId:mtime:grep"
const cache = new Map<string, { output: VccOutput; cachedAt: number }>();
const CACHE_TTL_MS = 30_000;

/**
 * Encode a project path the way Claude Code does:
 * /Users/moose/Moose/DevLog → -Users-moose-Moose-DevLog
 */
export function encodePath(projectPath: string): string {
  return projectPath.replace(/\//g, "-");
}

/**
 * Get the JSONL file path for a Claude session.
 */
export function getJsonlPath(
  claudeSessionId: string,
  projectPath: string
): string {
  const claudeDir = getClaudeProjectsDir();
  const encoded = encodePath(projectPath);
  return join(claudeDir, encoded, `${claudeSessionId}.jsonl`);
}

/**
 * Resolve the VCC.py script path.
 */
function getVccPath(): string {
  const envPath = process.env.VCC_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const defaultPath = join(
    process.env.HOME ?? "",
    ".claude",
    "skills",
    "conversation-compiler",
    "scripts",
    "VCC.py"
  );
  if (existsSync(defaultPath)) return defaultPath;

  throw new Error(
    "VCC.py not found. Set VCC_PATH environment variable or install conversation-compiler skill."
  );
}

/**
 * Compile a Claude session's JSONL using VCC.py.
 * Returns { full, brief, search } content.
 */
export async function compileSession(
  claudeSessionId: string,
  projectPath: string,
  grep?: string
): Promise<VccOutput> {
  const jsonlPath = getJsonlPath(claudeSessionId, projectPath);

  if (!existsSync(jsonlPath)) {
    return EMPTY;
  }

  // Check cache
  const mtime = statSync(jsonlPath).mtimeMs;
  const cacheKey = `${claudeSessionId}:${mtime}:${grep ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.output;
  }

  const vccPath = getVccPath();
  const args = [vccPath, jsonlPath];
  if (grep) {
    args.push("--grep", grep);
  }

  try {
    await execFileAsync("python3", args, {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("ENOENT")) {
      throw new Error("python3 not found. Install Python 3 to use VCC.");
    }
    // VCC might still produce output files even on non-zero exit — check below
  }

  // Read output files (VCC writes them next to the JSONL)
  const baseName = jsonlPath.replace(/\.jsonl$/, "");
  const output: VccOutput = {
    full: safeRead(`${baseName}.txt`),
    brief: safeRead(`${baseName}.min.txt`),
    search: grep ? safeRead(`${baseName}.view.txt`) : "",
  };

  cache.set(cacheKey, { output, cachedAt: Date.now() });
  return output;
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}
