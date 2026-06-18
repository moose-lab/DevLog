import { readdir, stat } from "fs/promises";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { basename, join } from "path";
import { homedir } from "os";
import dayjs from "dayjs";
import { discoverProjects } from "./discovery";
import type { Session } from "./types";

export const COST_REPORT_PROVIDERS = ["claude_code", "codex"] as const;
export type CostProvider = (typeof COST_REPORT_PROVIDERS)[number];
export type BillingMode = "api" | "oauth_subscription";

export type CostReportAgentCoverage =
  | {
      supported: true;
      provider: CostProvider;
      sourcePath: string;
      cacheStrategy: string;
    }
  | {
      supported: false;
      unsupportedReason: string;
    };

export const COST_REPORT_AGENT_COVERAGE = {
  claude: {
    supported: true,
    provider: "claude_code",
    sourcePath: "~/.claude/projects/**/*.jsonl",
    cacheStrategy: "discoverProjects() IM-23 cache keyed by path, mtimeMs, and size with bounded concurrency",
  },
  codex: {
    supported: true,
    provider: "codex",
    sourcePath: "~/.codex/sessions/**/*.jsonl plus ~/.codex/archived_sessions/**/*.jsonl",
    cacheStrategy: "scanCodexSessionCached() cache keyed by path, mtimeMs, and size with bounded concurrency",
  },
  "cursor-agent": {
    supported: false,
    unsupportedReason: "No durable local cost/usage history source is parsed by DevLog yet",
  },
  copilot: {
    supported: false,
    unsupportedReason: "No durable local cost/usage history source is parsed by DevLog yet",
  },
  gemini: {
    supported: false,
    unsupportedReason: "No durable local cost/usage history source is parsed by DevLog yet",
  },
  hermes: {
    supported: false,
    unsupportedReason: "Runner is pending and no durable local cost/usage history source is parsed by DevLog yet",
  },
  kimi: {
    supported: false,
    unsupportedReason: "Runner is pending and no durable local cost/usage history source is parsed by DevLog yet",
  },
  opencode: {
    supported: false,
    unsupportedReason: "No durable local cost/usage history source is parsed by DevLog yet",
  },
  pi: {
    supported: false,
    unsupportedReason: "Runner is pending and no durable local cost/usage history source is parsed by DevLog yet",
  },
  qwen: {
    supported: false,
    unsupportedReason: "No durable local cost/usage history source is parsed by DevLog yet",
  },
} as const satisfies Record<string, CostReportAgentCoverage>;

export interface CostTokenTotals {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface CostMoneyTotals {
  apiCostUSD: number;
  subscriptionCredits: number;
}

export interface CostPeriodTotals extends CostTokenTotals, CostMoneyTotals {
  usageEvents: number;
}

export interface CostQuotaWindow {
  provider: CostProvider;
  name: "primary" | "secondary";
  observedAt: string;
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number;
  resetsAt: string | null;
  source: "local_log";
}

export interface CostProjectSummary {
  projectName: string;
  projectPath: string;
  providers: CostProvider[];
  today: CostPeriodTotals;
  week: CostPeriodTotals;
  month: CostPeriodTotals;
  allTime: CostPeriodTotals;
}

export interface CostProviderSummary {
  provider: CostProvider;
  billingModes: BillingMode[];
  today: CostPeriodTotals;
  week: CostPeriodTotals;
  month: CostPeriodTotals;
  allTime: CostPeriodTotals;
  quota: CostQuotaWindow[];
}

export interface CostReport {
  generatedAt: string;
  totals: {
    today: CostPeriodTotals;
    week: CostPeriodTotals;
    month: CostPeriodTotals;
    allTime: CostPeriodTotals;
  };
  providers: CostProviderSummary[];
  projects: CostProjectSummary[];
  quota: CostQuotaWindow[];
  sources: {
    claudeProjectsDir: string;
    codexSessionsDir: string;
  };
}

interface UsageRecord {
  provider: CostProvider;
  billingMode: BillingMode;
  timestamp: Date;
  sessionId: string;
  projectName: string;
  projectPath: string;
  model: string;
  tokens: CostTokenTotals;
  apiCostUSD: number;
  subscriptionCredits: number;
}

interface CachedCodexScan {
  mtimeMs: number;
  size: number;
  parsed: {
    records: UsageRecord[];
    quota: CostQuotaWindow[];
  };
}

interface CodexRateLimitWindow {
  used_percent?: number;
  window_minutes?: number;
  resets_at?: number;
}

interface CodexTokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

const EMPTY_TOTALS: CostPeriodTotals = {
  usageEvents: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
  apiCostUSD: 0,
  subscriptionCredits: 0,
};

const CODEX_API_PRICING_USD: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-5.1-codex": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.1-codex-max": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-codex": { input: 1.25, cachedInput: 0.125, output: 10 },
};

const CODEX_CREDIT_RATES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-5.5": { input: 125, cachedInput: 12.5, output: 750 },
  "gpt-5.4-mini": { input: 18.75, cachedInput: 1.875, output: 113 },
  "gpt-5.4": { input: 62.5, cachedInput: 6.25, output: 375 },
  "gpt-5.3-codex": { input: 43.75, cachedInput: 4.375, output: 350 },
  "gpt-5.2": { input: 43.75, cachedInput: 4.375, output: 350 },
  "gpt-5.1-codex": { input: 43.75, cachedInput: 4.375, output: 350 },
  "gpt-5-codex": { input: 43.75, cachedInput: 4.375, output: 350 },
};

const CODEX_SCAN_CONCURRENCY = 8;
const codexScanCache = new Map<string, CachedCodexScan>();
let codexCacheHits = 0;
let codexCacheMisses = 0;

export function getCodexSessionsDir(): string {
  return join(homedir(), ".codex", "sessions");
}

export function getCodexArchivedSessionsDir(): string {
  return join(homedir(), ".codex", "archived_sessions");
}

export function emptyCostTotals(): CostPeriodTotals {
  return { ...EMPTY_TOTALS };
}

export function getCostTrackerCacheStats(): { hits: number; misses: number; entries: number } {
  return {
    hits: codexCacheHits,
    misses: codexCacheMisses,
    entries: codexScanCache.size,
  };
}

export function clearCostTrackerCache(): void {
  codexScanCache.clear();
  codexCacheHits = 0;
  codexCacheMisses = 0;
}

export function addCostTotals(target: CostPeriodTotals, source: CostPeriodTotals | UsageRecord): void {
  const tokens = "tokens" in source ? source.tokens : source;
  target.usageEvents += "usageEvents" in source ? source.usageEvents : 1;
  target.inputTokens += tokens.inputTokens;
  target.cachedInputTokens += tokens.cachedInputTokens;
  target.outputTokens += tokens.outputTokens;
  target.reasoningOutputTokens += tokens.reasoningOutputTokens;
  target.totalTokens += tokens.totalTokens;
  target.apiCostUSD += source.apiCostUSD;
  target.subscriptionCredits += source.subscriptionCredits;
}

export function computeCodexApiCostUSD(model: string, tokens: CostTokenTotals): number {
  const rate = findRate(model, CODEX_API_PRICING_USD);
  return pricedTotal(tokens, rate);
}

export function computeCodexSubscriptionCredits(model: string, tokens: CostTokenTotals): number {
  const rate = findRate(model, CODEX_CREDIT_RATES);
  return pricedTotal(tokens, rate);
}

export async function buildCostReport(options: {
  claudeProjectsDir?: string;
  codexSessionsDir?: string;
  now?: Date;
} = {}): Promise<CostReport> {
  const now = options.now ?? new Date();
  const claudeProjectsDir = options.claudeProjectsDir;
  const codexSessionsDir = options.codexSessionsDir ?? getCodexSessionsDir();
  const records: UsageRecord[] = [];

  const claudeProjects = await discoverProjects(claudeProjectsDir);
  for (const project of claudeProjects) {
    for (const session of project.sessions) {
      records.push(...claudeSessionToRecords(session));
    }
  }

  const includeArchived = codexSessionsDir === getCodexSessionsDir();
  const codexFiles = await listCodexSessionFiles(codexSessionsDir, includeArchived);
  const seenCodexFiles = new Set<string>();
  const quota: CostQuotaWindow[] = [];

  const parsedCodexSessions = await mapWithConcurrency(
    codexFiles,
    CODEX_SCAN_CONCURRENCY,
    (filePath) => scanCodexSessionCached(filePath, seenCodexFiles)
  );
  pruneCodexScanCache(
    [codexSessionsDir, ...(includeArchived ? [getCodexArchivedSessionsDir()] : [])],
    seenCodexFiles
  );

  for (const parsed of parsedCodexSessions) {
    records.push(...parsed.records);
    quota.push(...parsed.quota);
  }

  return aggregateCostReport(records, quota, {
    now,
    claudeProjectsDir: claudeProjectsDir ?? join(homedir(), ".claude", "projects"),
    codexSessionsDir,
  });
}

export function aggregateCostReport(
  records: UsageRecord[],
  quota: CostQuotaWindow[],
  options: { now: Date; claudeProjectsDir: string; codexSessionsDir: string }
): CostReport {
  const todayStart = dayjs(options.now).startOf("day");
  const weekStart = dayjs(options.now).subtract(7, "day").startOf("day");
  const monthStart = dayjs(options.now).subtract(1, "month").startOf("day");

  const totals = {
    today: emptyCostTotals(),
    week: emptyCostTotals(),
    month: emptyCostTotals(),
    allTime: emptyCostTotals(),
  };
  const providers = new Map<CostProvider, CostProviderSummary>();
  const projects = new Map<string, CostProjectSummary>();

  for (const record of records) {
    const isToday = dayjs(record.timestamp).isAfter(todayStart) || dayjs(record.timestamp).isSame(todayStart);
    const isWeek = dayjs(record.timestamp).isAfter(weekStart) || dayjs(record.timestamp).isSame(weekStart);
    const isMonth = dayjs(record.timestamp).isAfter(monthStart) || dayjs(record.timestamp).isSame(monthStart);

    addCostTotals(totals.allTime, record);
    if (isToday) addCostTotals(totals.today, record);
    if (isWeek) addCostTotals(totals.week, record);
    if (isMonth) addCostTotals(totals.month, record);

    const provider = getProviderSummary(providers, record.provider);
    if (!provider.billingModes.includes(record.billingMode)) provider.billingModes.push(record.billingMode);
    addCostTotals(provider.allTime, record);
    if (isToday) addCostTotals(provider.today, record);
    if (isWeek) addCostTotals(provider.week, record);
    if (isMonth) addCostTotals(provider.month, record);

    const project = getProjectSummary(projects, record.projectName, record.projectPath);
    if (!project.providers.includes(record.provider)) project.providers.push(record.provider);
    addCostTotals(project.allTime, record);
    if (isToday) addCostTotals(project.today, record);
    if (isWeek) addCostTotals(project.week, record);
    if (isMonth) addCostTotals(project.month, record);
  }

  for (const provider of providers.values()) {
    provider.quota = latestQuotaForProvider(quota, provider.provider);
  }

  return {
    generatedAt: options.now.toISOString(),
    totals: roundReportTotals(totals),
    providers: [...providers.values()].sort((a, b) => b.allTime.apiCostUSD - a.allTime.apiCostUSD),
    projects: [...projects.values()].sort((a, b) => b.allTime.apiCostUSD - a.allTime.apiCostUSD),
    quota: latestQuotaForProvider(quota, "codex"),
    sources: {
      claudeProjectsDir: options.claudeProjectsDir,
      codexSessionsDir: options.codexSessionsDir,
    },
  };
}

export async function scanCodexSession(filePath: string): Promise<{ records: UsageRecord[]; quota: CostQuotaWindow[] }> {
  const records: UsageRecord[] = [];
  const quota: CostQuotaWindow[] = [];
  const sessionId = basename(filePath, ".jsonl");
  let currentProjectPath = "unknown";
  let currentProjectName = "unknown";
  let currentModel = "gpt-5-codex";
  let previous = emptyTokens();

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const timestamp = event.timestamp ? new Date(event.timestamp) : new Date(0);

    if (event.type === "turn_context" && event.payload) {
      if (typeof event.payload.cwd === "string") {
        currentProjectPath = event.payload.cwd;
        currentProjectName = basename(currentProjectPath);
      }
      if (typeof event.payload.model === "string") {
        currentModel = event.payload.model;
      }
      continue;
    }

    if (event.type !== "event_msg" || event.payload?.type !== "token_count") continue;

    quota.push(...extractCodexQuota(event.payload.rate_limits, timestamp));

    const usage = event.payload.info?.total_token_usage as CodexTokenUsage | undefined;
    if (!usage) continue;

    const current = normalizeCodexTokens(usage);
    const delta = diffTokens(current, previous);
    previous = maxTokens(previous, current);

    if (delta.totalTokens <= 0) continue;

    records.push({
      provider: "codex",
      billingMode: "oauth_subscription",
      timestamp,
      sessionId,
      projectName: currentProjectName,
      projectPath: currentProjectPath,
      model: currentModel,
      tokens: delta,
      apiCostUSD: computeCodexApiCostUSD(currentModel, delta),
      subscriptionCredits: computeCodexSubscriptionCredits(currentModel, delta),
    });
  }

  return { records, quota };
}

async function scanCodexSessionCached(
  filePath: string,
  seenFiles: Set<string>
): Promise<{ records: UsageRecord[]; quota: CostQuotaWindow[] } | null> {
  try {
    const fileStat = await stat(filePath);
    seenFiles.add(filePath);

    const cached = codexScanCache.get(filePath);
    if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
      codexCacheHits++;
      return cached.parsed;
    }

    codexCacheMisses++;
    const parsed = await scanCodexSession(filePath);
    codexScanCache.set(filePath, {
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      parsed,
    });
    return parsed;
  } catch {
    return null;
  }
}

function pruneCodexScanCache(roots: string[], seen: Set<string>): void {
  const prefixes = roots.map((root) => (root.endsWith("/") ? root : `${root}/`));
  for (const key of codexScanCache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix)) && !seen.has(key)) {
      codexScanCache.delete(key);
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R | null>
): Promise<R[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) break;
        results[index] = await fn(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results.filter((item): item is R => item !== null);
}

async function listCodexSessionFiles(root: string, includeArchived: boolean): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(path);
    }
  }

  await walk(root);
  if (includeArchived) await walk(getCodexArchivedSessionsDir());
  return out;
}

/**
 * One usage record per (local day, model) bucket, so spend is attributed to
 * the day each message actually ran (IM-24). Sessions scanned by older code
 * (no dailyUsage) fall back to the legacy whole-session record.
 */
export function claudeSessionToRecords(session: Session): UsageRecord[] {
  const daily = session.meta.dailyUsage;
  if (!daily || daily.length === 0) {
    return [claudeSessionToRecord(session)];
  }
  return daily.map((bucket) => ({
    provider: "claude_code" as const,
    billingMode: "api" as const,
    timestamp: new Date(bucket.lastTimestamp),
    sessionId: session.id,
    projectName: session.projectName,
    projectPath: session.projectPath,
    model: bucket.model,
    tokens: {
      inputTokens: bucket.inputTokens,
      cachedInputTokens: bucket.cachedInputTokens,
      outputTokens: bucket.outputTokens,
      reasoningOutputTokens: 0,
      totalTokens:
        bucket.inputTokens + bucket.cachedInputTokens + bucket.outputTokens,
    },
    apiCostUSD: bucket.costUSD,
    subscriptionCredits: 0,
  }));
}

function claudeSessionToRecord(session: Session): UsageRecord {
  return {
    provider: "claude_code",
    billingMode: "api",
    timestamp: session.updatedAt,
    sessionId: session.id,
    projectName: session.projectName,
    projectPath: session.projectPath,
    model: session.meta.models[0] ?? "unknown",
    tokens: emptyTokens(),
    apiCostUSD: session.meta.totalCostUSD,
    subscriptionCredits: 0,
  };
}

function extractCodexQuota(rateLimits: any, timestamp: Date): CostQuotaWindow[] {
  const windows: CostQuotaWindow[] = [];
  for (const name of ["primary", "secondary"] as const) {
    const value = rateLimits?.[name] as CodexRateLimitWindow | undefined;
    if (!value || typeof value.used_percent !== "number" || typeof value.window_minutes !== "number") continue;
    windows.push({
      provider: "codex",
      name,
      observedAt: timestamp.toISOString(),
      usedPercent: clampPercent(value.used_percent),
      remainingPercent: clampPercent(100 - value.used_percent),
      windowMinutes: value.window_minutes,
      resetsAt: typeof value.resets_at === "number" ? new Date(value.resets_at * 1000).toISOString() : null,
      source: "local_log",
    });
  }
  return windows.sort((a, b) => a.name.localeCompare(b.name));
}

function getProviderSummary(map: Map<CostProvider, CostProviderSummary>, provider: CostProvider): CostProviderSummary {
  const existing = map.get(provider);
  if (existing) return existing;
  const created: CostProviderSummary = {
    provider,
    billingModes: [],
    today: emptyCostTotals(),
    week: emptyCostTotals(),
    month: emptyCostTotals(),
    allTime: emptyCostTotals(),
    quota: [],
  };
  map.set(provider, created);
  return created;
}

function getProjectSummary(map: Map<string, CostProjectSummary>, name: string, path: string): CostProjectSummary {
  const key = `${name}\0${path}`;
  const existing = map.get(key);
  if (existing) return existing;
  const created: CostProjectSummary = {
    projectName: name,
    projectPath: path,
    providers: [],
    today: emptyCostTotals(),
    week: emptyCostTotals(),
    month: emptyCostTotals(),
    allTime: emptyCostTotals(),
  };
  map.set(key, created);
  return created;
}

function latestQuotaForProvider(quota: CostQuotaWindow[], provider: CostProvider): CostQuotaWindow[] {
  const byName = new Map<string, CostQuotaWindow>();
  for (const item of quota.filter((q) => q.provider === provider)) {
    const existing = byName.get(item.name);
    if (!existing || new Date(item.observedAt).getTime() >= new Date(existing.observedAt).getTime()) {
      byName.set(item.name, item);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function roundReportTotals<T extends { today: CostPeriodTotals; week: CostPeriodTotals; month: CostPeriodTotals; allTime: CostPeriodTotals }>(value: T): T {
  value.today = roundTotals(value.today);
  value.week = roundTotals(value.week);
  value.month = roundTotals(value.month);
  value.allTime = roundTotals(value.allTime);
  return value;
}

function roundTotals(totals: CostPeriodTotals): CostPeriodTotals {
  return {
    ...totals,
    apiCostUSD: roundMoney(totals.apiCostUSD),
    subscriptionCredits: roundMoney(totals.subscriptionCredits),
  };
}

function normalizeCodexTokens(usage: CodexTokenUsage): CostTokenTotals {
  return {
    inputTokens: usage.input_tokens ?? 0,
    cachedInputTokens: usage.cached_input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    reasoningOutputTokens: usage.reasoning_output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

function emptyTokens(): CostTokenTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function diffTokens(current: CostTokenTotals, previous: CostTokenTotals): CostTokenTotals {
  return {
    inputTokens: Math.max(0, current.inputTokens - previous.inputTokens),
    cachedInputTokens: Math.max(0, current.cachedInputTokens - previous.cachedInputTokens),
    outputTokens: Math.max(0, current.outputTokens - previous.outputTokens),
    reasoningOutputTokens: Math.max(0, current.reasoningOutputTokens - previous.reasoningOutputTokens),
    totalTokens: Math.max(0, current.totalTokens - previous.totalTokens),
  };
}

function maxTokens(a: CostTokenTotals, b: CostTokenTotals): CostTokenTotals {
  return {
    inputTokens: Math.max(a.inputTokens, b.inputTokens),
    cachedInputTokens: Math.max(a.cachedInputTokens, b.cachedInputTokens),
    outputTokens: Math.max(a.outputTokens, b.outputTokens),
    reasoningOutputTokens: Math.max(a.reasoningOutputTokens, b.reasoningOutputTokens),
    totalTokens: Math.max(a.totalTokens, b.totalTokens),
  };
}

function findRate(model: string, table: Record<string, { input: number; cachedInput: number; output: number }>) {
  const normalized = model.toLowerCase();
  for (const [key, rate] of Object.entries(table).sort((a, b) => b[0].length - a[0].length)) {
    if (normalized.includes(key)) return rate;
  }
  return table["gpt-5-codex"] ?? table["gpt-5.1-codex"];
}

function pricedTotal(tokens: CostTokenTotals, rate: { input: number; cachedInput: number; output: number }): number {
  const perM = 1_000_000;
  return (
    (tokens.inputTokens * rate.input) / perM +
    (tokens.cachedInputTokens * rate.cachedInput) / perM +
    (tokens.outputTokens * rate.output) / perM
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
