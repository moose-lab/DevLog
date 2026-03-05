import { createReadStream } from "fs";
import { createInterface } from "readline";
import type {
  RawJsonlEvent,
  DevLogEvent,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  SessionMeta,
} from "./types.js";
import { computeCost } from "./pricing.js";

// Types to skip entirely
const SKIP_TYPES = new Set([
  "progress",
  "file-history-snapshot",
  "queue-operation",
]);

/**
 * Resolve the effective role from the event.
 * Real Claude Code uses type:"user"/"assistant", legacy uses type:"human"/"assistant".
 */
function resolveRole(event: RawJsonlEvent): "human" | "assistant" | null {
  const t = event.type;
  if (t === "human" || t === "user") return "human";
  if (t === "assistant") return "assistant";
  return null;
}

/**
 * Get content blocks from the event, supporting both real and legacy formats.
 * Real: event.message.content
 * Legacy: event.content
 */
function getContent(event: RawJsonlEvent): ContentBlock[] | string | undefined {
  if (event.message && typeof event.message === "object" && event.message.content != null) {
    return event.message.content;
  }
  return event.content;
}

/**
 * Get model from the event, supporting both formats.
 */
function getModel(event: RawJsonlEvent): string | undefined {
  if (event.message && typeof event.message === "object" && event.message.model) {
    return event.message.model;
  }
  return event.model;
}

/**
 * Rich scan: extract full metadata from a session file in a single streaming pass.
 */
export async function scanSession(filePath: string): Promise<SessionMeta> {
  const meta: SessionMeta = {
    messageCount: 0,
    humanTurns: 0,
    assistantTurns: 0,
    toolCalls: 0,
    uniqueTools: [],
    filesReferenced: [],
    totalCostUSD: 0,
    totalDurationMs: 0,
    models: [],
    firstUserMessage: "",
    lastActivity: new Date(0),
    firstActivity: new Date(),
    errorCount: 0,
    costByModel: {},
  };

  const toolSet = new Set<string>();
  const fileSet = new Set<string>();
  const modelSet = new Set<string>();

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as RawJsonlEvent;

      if (SKIP_TYPES.has(event.type)) continue;

      const ts = event.timestamp ? new Date(event.timestamp) : null;

      if (ts) {
        if (ts < meta.firstActivity) meta.firstActivity = ts;
        if (ts > meta.lastActivity) meta.lastActivity = ts;
      }

      const role = resolveRole(event);

      // Count messages
      if (role === "human") {
        meta.humanTurns++;
        meta.messageCount++;
      }
      if (role === "assistant") {
        meta.assistantTurns++;
        meta.messageCount++;
      }

      // First user message
      if (role === "human" && !meta.firstUserMessage) {
        meta.firstUserMessage = extractTextContent(event);
      }

      // Cost: compute from usage tokens (costUSD is null in real data)
      const model = getModel(event);
      const usage = event.message && typeof event.message === "object" ? event.message.usage : undefined;
      if (model && usage) {
        const cost = computeCost(model, usage);
        meta.totalCostUSD += cost;
        meta.costByModel[model] = (meta.costByModel[model] || 0) + cost;
      } else if (event.costUSD && typeof event.costUSD === "number") {
        // Legacy fallback
        meta.totalCostUSD += event.costUSD;
        const m = model || "unknown";
        meta.costByModel[m] = (meta.costByModel[m] || 0) + event.costUSD;
      }

      // Duration from system turn_duration events
      if (event.type === "system" && event.subtype === "turn_duration") {
        const dur = (event as Record<string, unknown>).durationMs;
        if (typeof dur === "number") {
          meta.totalDurationMs += dur;
        }
      }
      if (event.durationMs && typeof event.durationMs === "number") {
        meta.totalDurationMs += event.durationMs;
      }

      // Model tracking
      if (model) {
        modelSet.add(model);
      }

      // Tool call extraction from content blocks
      const content = getContent(event);
      if (Array.isArray(content)) {
        for (const block of content as ContentBlock[]) {
          if (block.type === "tool_use") {
            const tb = block as ToolUseBlock;
            meta.toolCalls++;
            toolSet.add(tb.name);

            // Extract file references from tool inputs
            const input = tb.input;
            if (input) {
              for (const key of ["file_path", "path", "filePath"]) {
                if (input[key] && typeof input[key] === "string") {
                  fileSet.add(input[key] as string);
                }
              }
            }
          }
          if (block.type === "tool_result") {
            const rb = block as ToolResultBlock;
            if (rb.is_error) meta.errorCount++;
          }
        }
      }
    } catch {
      continue;
    }
  }

  meta.uniqueTools = [...toolSet];
  meta.filesReferenced = [...fileSet];
  meta.models = [...modelSet];

  return meta;
}

/**
 * Fully parse a session file into DevLogEvent array.
 */
export async function parseSessionFile(
  filePath: string,
  sessionId: string
): Promise<DevLogEvent[]> {
  const events: DevLogEvent[] = [];
  let lineIndex = 0;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    lineIndex++;

    try {
      const raw = JSON.parse(line) as RawJsonlEvent;
      if (SKIP_TYPES.has(raw.type)) continue;
      const parsed = normalizeEvent(raw, sessionId, lineIndex);
      if (parsed.length > 0) {
        events.push(...parsed);
      }
    } catch {
      continue;
    }
  }

  return events;
}

function normalizeEvent(
  raw: RawJsonlEvent,
  sessionId: string,
  lineIndex: number
): DevLogEvent[] {
  const events: DevLogEvent[] = [];
  const timestamp = raw.timestamp ? new Date(raw.timestamp) : new Date();
  const baseId = raw.uuid || `${sessionId}-${lineIndex}`;
  const role = resolveRole(raw);
  const content = getContent(raw);
  const model = getModel(raw);

  if (role && Array.isArray(content)) {
    const blocks = content as ContentBlock[];
    let blockIndex = 0;

    for (const block of blocks) {
      blockIndex++;
      const eventId = `${baseId}-${blockIndex}`;

      if (block.type === "text") {
        const textBlock = block as TextBlock;
        events.push({
          id: eventId,
          sessionId,
          timestamp,
          role: role,
          type: "text",
          content: textBlock.text,
          costUSD: raw.costUSD,
          durationMs: raw.durationMs,
          model,
          raw,
        });
      } else if (block.type === "tool_use") {
        const toolBlock = block as ToolUseBlock;
        events.push({
          id: eventId,
          sessionId,
          timestamp,
          role: "tool_use",
          type: "tool_use",
          content: `${toolBlock.name}(${summarizeToolInput(toolBlock.input)})`,
          toolName: toolBlock.name,
          toolInput: toolBlock.input,
          toolUseId: toolBlock.id,
          raw,
        });
      } else if (block.type === "tool_result") {
        const resultBlock = block as ToolResultBlock;
        events.push({
          id: eventId,
          sessionId,
          timestamp,
          role: "tool_result",
          type: "tool_result",
          content: extractToolResultContent(resultBlock),
          toolUseId: resultBlock.tool_use_id,
          isError: resultBlock.is_error,
          raw,
        });
      }
    }

    if (typeof content === "string") {
      events.push({
        id: baseId,
        sessionId,
        timestamp,
        role: role,
        type: "message",
        content: content,
        raw,
      });
    }

    if (events.length === 0) {
      events.push({
        id: baseId,
        sessionId,
        timestamp,
        role: role,
        type: "message",
        content: extractTextContent(raw),
        raw,
      });
    }
  } else if (role === "human" && typeof content === "string") {
    events.push({
      id: baseId,
      sessionId,
      timestamp,
      role: "human",
      type: "message",
      content: content,
      raw,
    });
  } else if (raw.type === "summary") {
    events.push({
      id: baseId,
      sessionId,
      timestamp,
      role: "system",
      type: "summary",
      content: raw.summary || "",
      raw,
    });
  }

  return events;
}

function extractTextContent(event: RawJsonlEvent): string {
  // Check message.content first (real Claude Code format)
  const msgContent = event.message && typeof event.message === "object" ? event.message.content : undefined;
  if (typeof msgContent === "string") return msgContent;
  if (Array.isArray(msgContent)) {
    const textBlocks = (msgContent as ContentBlock[]).filter(
      (b): b is TextBlock => b.type === "text"
    );
    if (textBlocks.length > 0) return textBlocks.map((b) => b.text).join("\n");
  }

  // Legacy format
  if (typeof event.content === "string") return event.content;
  if (Array.isArray(event.content)) {
    const textBlocks = event.content.filter(
      (b): b is TextBlock => b.type === "text"
    );
    if (textBlocks.length > 0) return textBlocks.map((b) => b.text).join("\n");
  }
  return "";
}

function summarizeToolInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  if (input.command && typeof input.command === "string")
    parts.push(truncateStr(input.command, 60));
  if (input.file_path && typeof input.file_path === "string")
    parts.push(input.file_path as string);
  if (input.path && typeof input.path === "string")
    parts.push(input.path as string);
  if (input.query && typeof input.query === "string")
    parts.push(truncateStr(input.query, 40));

  if (parts.length === 0) {
    return Object.keys(input).slice(0, 3).join(", ");
  }
  return parts.join(", ");
}

function extractToolResultContent(block: ToolResultBlock): string {
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) {
    return block.content
      .filter((item) => item.text)
      .map((item) => item.text)
      .join("\n");
  }
  return "";
}

function truncateStr(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}
