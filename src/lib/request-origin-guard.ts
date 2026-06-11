/**
 * Origin/Host guard for the local API (CR-6).
 *
 * DevLog binds to localhost with no auth, so the threat model is a malicious
 * webpage in the user's browser: cross-origin form/fetch CSRF against
 * state-changing routes, and DNS rebinding to read local data. Two checks
 * close both: the Host header must be loopback for every API request, and
 * mutating requests must not carry cross-origin browser markers. Requests
 * without browser headers (curl, scripts) stay allowed.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const ALLOWED_SEC_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export interface ApiRequestContext {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
}

export interface ApiRequestVerdict {
  allowed: boolean;
  reason?: string;
}

function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  try {
    const { hostname } = new URL(`http://${hostHeader}`);
    return LOOPBACK_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return LOOPBACK_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function evaluateApiRequest(ctx: ApiRequestContext): ApiRequestVerdict {
  if (!isLoopbackHost(ctx.host)) {
    return { allowed: false, reason: "API requests must target localhost" };
  }

  if (SAFE_METHODS.has(ctx.method.toUpperCase())) {
    return { allowed: true };
  }

  if (ctx.secFetchSite && !ALLOWED_SEC_FETCH_SITES.has(ctx.secFetchSite)) {
    return { allowed: false, reason: "Cross-site API mutations are not allowed" };
  }

  if (ctx.origin && !isLoopbackOrigin(ctx.origin)) {
    return { allowed: false, reason: "Cross-origin API mutations are not allowed" };
  }

  return { allowed: true };
}
