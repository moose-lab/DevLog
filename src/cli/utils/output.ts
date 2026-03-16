export interface OutputContext {
  json: boolean;
  quiet: boolean;
}

let ctx: OutputContext = { json: false, quiet: false };

export function initOutput(opts: OutputContext): void {
  ctx = opts;
}

export function getOutputContext(): OutputContext {
  return ctx;
}

/** Write JSON to stdout */
export function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

/** Progress info to stderr (suppressed in quiet mode) */
export function logStatus(msg: string): void {
  if (!ctx.quiet) {
    process.stderr.write(msg + "\n");
  }
}

/** Errors always go to stderr */
export function logError(msg: string): void {
  process.stderr.write(msg + "\n");
}

/** Whether we are in JSON output mode */
export function isJsonMode(): boolean {
  return ctx.json;
}

/** Whether we are in quiet mode */
export function isQuietMode(): boolean {
  return ctx.quiet;
}
