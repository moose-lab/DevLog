// ── Core Types ─────────────────────────────────────────────

export type MessageRole = "human" | "assistant";

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface GlobalOptions {
  json: boolean;
  quiet: boolean;
}
export type ContentBlockType = "text" | "tool_use" | "tool_result";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface RawJsonlEvent {
  type: string;
  subtype?: string;
  parentUuid?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  role?: MessageRole;
  content?: ContentBlock[] | string;
  summary?: string;
  costUSD?: number;
  durationMs?: number;
  model?: string;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
    model?: string;
    type?: string;
    usage?: TokenUsage;
    id?: string;
  };
  [key: string]: unknown;
}

export interface DevLogEvent {
  id: string;
  sessionId: string;
  timestamp: Date;
  role: MessageRole | "tool_use" | "tool_result" | "system";
  type: ContentBlockType | "message" | "summary" | "unknown";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  isError?: boolean;
  costUSD?: number;
  durationMs?: number;
  model?: string;
  raw?: RawJsonlEvent;
}

/**
 * Rich session metadata — the key to emotional display
 */
export interface SessionMeta {
  messageCount: number;
  humanTurns: number;
  assistantTurns: number;
  toolCalls: number;
  uniqueTools: string[];
  filesReferenced: string[];
  totalCostUSD: number;
  totalDurationMs: number;
  models: string[];
  firstUserMessage: string;
  lastActivity: Date;
  firstActivity: Date;
  errorCount: number;
  costByModel: Record<string, number>;
}

export interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  createdAt: Date;
  updatedAt: Date;
  meta: SessionMeta;
  events?: DevLogEvent[];
}

export interface Project {
  path: string;
  name: string;
  encodedPath: string;
  sessionCount: number;
  sessions: Session[];
}

export interface DevLogConfig {
  claudeDir: string;
  devlogDir: string;
  version: string;
}

/**
 * Aggregate stats for the emotional dashboard
 */
export interface AggregateStats {
  totalProjects: number;
  totalSessions: number;
  totalMessages: number;
  totalHumanTurns: number;
  totalAssistantTurns: number;
  totalToolCalls: number;
  totalCostUSD: number;
  totalDurationMs: number;
  uniqueToolsUsed: string[];
  allFilesReferenced: string[];
  modelsUsed: string[];
  todaySessions: number;
  todayMessages: number;
  todayCostUSD: number;
  mostActiveProject: string;
  mostActiveProjectSessions: number;
}

// ── Stats Cache ──────────────────────────────────────────

export interface StatsCache {
  timestamp: string;      // ISO date of last computation
  todayDate: string;      // "YYYY-MM-DD" — invalidate on day change
  today: {
    sessions: number;
    costUSD: number;
    messages: number;
    toolCalls: number;
    filesTouched: number;
    projects: string[];
  };
  allTime: {
    sessions: number;
    costUSD: number;
    projects: number;
  };
}

// ── JSON Output Types ──────────────────────────────────────

export interface SessionJson {
  id: string;
  projectName: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  toolCalls: number;
  filesTouched: number;
  costUSD: number;
  firstMessage: string;
}

export interface DashboardJson {
  version: string;
  timestamp: string;
  summary: string;
  stats: {
    totalProjects: number;
    totalSessions: number;
    totalToolCalls: number;
    totalFilesTouched: number;
    totalCostUSD: number;
    todaySessions: number;
    todayCostUSD: number;
  };
  recentSessions: SessionJson[];
}

export interface SessionsJson {
  projects: {
    name: string;
    path: string;
    sessionCount: number;
    sessions: SessionJson[];
  }[];
}

export interface ShowJson {
  session: {
    id: string;
    projectName: string;
    meta: SessionMeta;
  };
  events: {
    timestamp: string;
    role: string;
    type: string;
    content: string;
    toolName?: string;
    isError?: boolean;
  }[];
}
