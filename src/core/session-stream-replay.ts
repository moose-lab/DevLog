import type Database from "better-sqlite3";
import type { ChatStreamEvent } from "./stream-manager";

export interface SessionStreamReplayOptions {
  logLimit?: number;
}

type SessionRow = {
  id: string;
  status: string;
  pid: number | null;
  started_at: string | null;
  ended_at: string | null;
};

type MessageRow = {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type LogRow = {
  id: number;
  stream: "stdout" | "stderr";
  chunk: string;
  timestamp: string;
};

type ReplayItem = {
  id: number;
  timestamp: string;
  sourceOrder: number;
  event: ChatStreamEvent;
};

const DEFAULT_LOG_LIMIT = 100;

export function buildSessionStreamReplayEvents(
  db: Database.Database,
  sessionId: string,
  options: SessionStreamReplayOptions = {},
): ChatStreamEvent[] {
  const session = db
    .prepare("SELECT id, status, pid, started_at, ended_at FROM sessions WHERE id = ?")
    .get(sessionId) as SessionRow | undefined;

  if (!session) {
    return [];
  }

  const messages = db
    .prepare(
      "SELECT id, role, content, timestamp FROM session_messages WHERE session_id = ? ORDER BY timestamp ASC, id ASC",
    )
    .all(sessionId) as MessageRow[];
  const logLimit = normalizeLogLimit(options.logLimit);
  const logs =
    logLimit > 0
      ? (db
          .prepare(
            `SELECT id, stream, chunk, timestamp
             FROM (
               SELECT id, stream, chunk, timestamp
               FROM session_logs
               WHERE session_id = ?
               ORDER BY timestamp DESC, id DESC
               LIMIT ?
             )
             ORDER BY timestamp ASC, id ASC`,
          )
          .all(sessionId, logLimit) as LogRow[])
      : [];

  const replayItems: ReplayItem[] = [
    ...messages.map((message) => ({
      id: message.id,
      timestamp: message.timestamp,
      sourceOrder: 0,
      event: {
        type: "message" as const,
        id: message.id,
        role: message.role,
        content: message.content,
      },
    })),
    ...logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      sourceOrder: 1,
      event: {
        type: "log" as const,
        id: log.id,
        stream: log.stream,
        chunk: log.chunk,
        timestamp: log.timestamp,
      },
    })),
  ].sort((left, right) => {
    const timestampOrder = left.timestamp.localeCompare(right.timestamp);
    if (timestampOrder !== 0) {
      return timestampOrder;
    }
    const idOrder = left.id - right.id;
    if (idOrder !== 0) {
      return idOrder;
    }
    return left.sourceOrder - right.sourceOrder;
  });

  return [
    {
      type: "status",
      status: session.status,
      pid: session.pid,
      started_at: session.started_at,
      ended_at: session.ended_at,
    },
    ...replayItems.map((item) => item.event),
  ];
}

function normalizeLogLimit(logLimit: number | undefined): number {
  if (logLimit === undefined) {
    return DEFAULT_LOG_LIMIT;
  }
  if (!Number.isFinite(logLimit)) {
    return DEFAULT_LOG_LIMIT;
  }
  return Math.max(0, Math.floor(logLimit));
}
