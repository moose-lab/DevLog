import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync, statSync } from "fs";
import { isAbsolute, join, relative } from "path";
import { getClaudeProjectsDir } from "./paths";

/**
 * claude_session_id is parsed from agent stdout, so it must stay a single
 * path-safe token before reaching the filesystem or python3 argv (IM-19).
 */
const CLAUDE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidClaudeSessionId(id: string): boolean {
  return CLAUDE_SESSION_ID_PATTERN.test(id);
}

const execFileAsync = promisify(execFile);

export interface VccOutput {
  full: string;
  brief: string;
  search: string;
}

const EMPTY: VccOutput = { full: "", brief: "", search: "" };

/**
 * TTL cache with an entry bound (IM-25). The previous Map keyed by
 * sessionId:mtime never evicted — every session edit added a permanent
 * MB-scale entry to a long-running server.
 */
export class BoundedTtlCache<V> {
  private entries = new Map<string, { value: V; cachedAt: number }>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string, now = Date.now()): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.cachedAt >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, now = Date.now()): void {
    for (const [k, entry] of this.entries) {
      if (now - entry.cachedAt >= this.ttlMs) this.entries.delete(k);
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { value, cachedAt: now });
  }
}

// In-memory cache: key = "sessionId:mtime:grep"
const CACHE_TTL_MS = 30_000;
const cache = new BoundedTtlCache<VccOutput>(32, CACHE_TTL_MS);

/**
 * Serializes async work per key (IM-25): concurrent compiles of one session
 * write the same output files next to the JSONL and would read each other's
 * partial output. Different keys run concurrently.
 */
const serialQueues = new Map<string, Promise<unknown>>();

export function runSerializedByKey<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = serialQueues.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  serialQueues.set(key, tail);
  void tail.then(() => {
    if (serialQueues.get(key) === tail) serialQueues.delete(key);
  });
  return run;
}

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
  if (!isValidClaudeSessionId(claudeSessionId)) {
    throw new Error("Invalid Claude session id");
  }

  const jsonlPath = getJsonlPath(claudeSessionId, projectPath);
  const containment = relative(getClaudeProjectsDir(), jsonlPath);
  if (containment.startsWith("..") || isAbsolute(containment)) {
    throw new Error("Invalid Claude session id");
  }

  if (!existsSync(jsonlPath)) {
    return EMPTY;
  }

  // Serialize per session: compiles share output files next to the JSONL.
  return runSerializedByKey(claudeSessionId, async () => {
    const mtime = statSync(jsonlPath).mtimeMs;
    const cacheKey = `${claudeSessionId}:${mtime}:${grep ?? ""}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const vccPath = getVccPath();
    const args = [vccPath, jsonlPath];
    if (grep) {
      args.push("--grep", grep);
    }

    const startedAt = Date.now();
    let execError: Error | null = null;
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
      // VCC might still produce output files even on non-zero exit — but a
      // failed run must not serve a previous run's files as current.
      execError = err as Error;
    }

    // Read output files (VCC writes them next to the JSONL)
    const baseName = jsonlPath.replace(/\.jsonl$/, "");
    if (execError && outputMtimeMs(`${baseName}.txt`) < startedAt) {
      throw execError;
    }
    const output: VccOutput = {
      full: safeRead(`${baseName}.txt`),
      brief: safeRead(`${baseName}.min.txt`),
      search: grep ? safeRead(`${baseName}.view.txt`) : "",
    };

    cache.set(cacheKey, output);
    return output;
  });
}

function outputMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}
