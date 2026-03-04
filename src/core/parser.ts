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

/**
 * Rich scan: extract full metadata from a session file in a single streaming pass.
 * This replaces the old quickScanSession — same performance, 10x more insight.
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
      const ts = event.timestamp ? new Date(event.timestamp) : null;

      if (ts) {
        if (ts < meta.firstActivity) meta.firstActivity = ts;
        if (ts > meta.lastActivity) meta.lastActivity = ts;
      }

      // Count messages
      if (event.type === "human") {
        meta.humanTurns++;
        meta.messageCount++;
      }
      if (event.type === "assistant") {
        meta.assistantTurns++;
        meta.messageCount++;
      }

      // First user message
      if (event.type === "human" && !meta.firstUserMessage) {
        meta.firstUserMessage = extractTextContent(event);
      }

      // Cost & duration tracking
      if (event.costUSD && typeof event.costUSD === "number") {
        meta.totalCostUSD += event.costUSD;
      }
      if (event.durationMs && typeof event.durationMs === "number") {
        meta.totalDurationMs += event.durationMs;
      }

      // Model tracking
      if (event.model && typeof event.model === "string") {
        modelSet.add(event.model);
      }

      // Tool call extraction from content blocks
      if (Array.isArray(event.content)) {
        for (const block of event.content as ContentBlock[]) {
          if (block.type === "tool_use") {
            const tb = block as ToolUseBlock;
            meta.toolCalls++;
            toolSet.add(tb.name);

            // Extract file references from tool inputs
            const input = tb.input;
            for (const key of ["file_path", "path", "filePath"]) {
              if (input[key] && typeof input[key] === "string") {
                fileSet.add(input[key] as string);
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

  if (
    (raw.type === "human" || raw.type === "assistant") &&
    Array.isArray(raw.content)
  ) {
    const blocks = raw.content as ContentBlock[];
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
          role: raw.type as "human" | "assistant",
          type: "text",
          content: textBlock.text,
          costUSD: raw.costUSD,
          durationMs: raw.durationMs,
          model: raw.model,
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

    if (typeof raw.content === "string") {
      events.push({
        id: baseId,
        sessionId,
        timestamp,
        role: raw.type as "human" | "assistant",
        type: "message",
        content: raw.content,
        raw,
      });
    }

    if (events.length === 0) {
      events.push({
        id: baseId,
        sessionId,
        timestamp,
        role: raw.type as "human" | "assistant",
        type: "message",
        content: extractTextContent(raw),
        raw,
      });
    }
  } else if (raw.type === "human" && typeof raw.content === "string") {
    events.push({
      id: baseId,
      sessionId,
      timestamp,
      role: "human",
      type: "message",
      content: raw.content,
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
  if (typeof event.content === "string") return event.content;
  if (Array.isArray(event.content)) {
    const textBlocks = event.content.filter(
      (b): b is TextBlock => b.type === "text"
    );
    if (textBlocks.length > 0) return textBlocks.map((b) => b.text).join("\n");
  }
  if (event.message && typeof event.message === "string") return event.message;
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
  return str.slice(0, max - 1) + "…";
}
