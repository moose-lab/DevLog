import type Database from "better-sqlite3";
import {
  runProviderChatCompletion,
  validateProviderRuntimeConfig,
  type FetchImpl,
  type ProviderChatMessage,
} from "./api-provider-runtime";
import {
  resolveStoredSessionRuntimeAuthConfig,
  type SessionRuntimeAuthInput,
} from "./session-runtime-auth";
import type { ChatStreamEvent } from "./stream-manager";

export interface ProviderSessionTurnOptions {
  db: Database.Database;
  sessionId: string;
  message: string;
  runtimeAuthInput?: SessionRuntimeAuthInput;
  emit: (sessionId: string, event: ChatStreamEvent) => void;
  fetchImpl?: FetchImpl;
}

interface StoredSessionRuntimeRow {
  session_auth_mode: string | null;
  agent_api_key_env_var: string | null;
  local_cli_agent_id: string | null;
  agent_model: string | null;
  agent_reasoning: string | null;
  agent_api_protocol: string | null;
  agent_api_version: string | null;
  agent_base_url: string | null;
  agent_max_tokens: number | null;
}

interface StoredSessionStatusRow {
  status: string | null;
}

export async function runProviderSessionTurn({
  db,
  sessionId,
  message,
  runtimeAuthInput = {},
  emit,
  fetchImpl,
}: ProviderSessionTurnOptions): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = getStoredSessionRuntimeRow(db, sessionId);
  if (!session) {
    return { ok: false, error: "Session not found" };
  }

  const runtimeAuthConfig = resolveStoredSessionRuntimeAuthConfig(
    session,
    runtimeAuthInput,
  );

  if (
    runtimeAuthConfig.mode !== "anthropic-api-key" ||
    runtimeAuthConfig.usesLegacyEnvVar
  ) {
    return {
      ok: false,
      error: "Provider session runtime requires browser BYOK API mode.",
    };
  }

  const validated = validateProviderRuntimeConfig(runtimeAuthConfig);
  if (!validated.ok) {
    db.prepare(
      "UPDATE sessions SET status = 'failed', ended_at = datetime('now') WHERE id = ?",
    ).run(sessionId);
    emit(sessionId, { type: "error", message: validated.error });
    emit(sessionId, { type: "status", status: "failed" });
    return { ok: false, error: validated.error };
  }

  const insertedUser = db.prepare(
    "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'user', ?)",
  ).run(sessionId, message);

  db.prepare("UPDATE sessions SET status = 'running' WHERE id = ?").run(
    sessionId,
  );
  emit(sessionId, { type: "status", status: "running" });

  const history = getProviderChatHistory(db, sessionId);
  const result = await runProviderChatCompletion(runtimeAuthConfig, history, {
    fetchImpl,
  });
  const postRequestStatus = getStoredSessionStatus(db, sessionId);
  if (postRequestStatus !== "running") {
    db.prepare(
      "DELETE FROM session_messages WHERE id = ? AND session_id = ? AND role = 'user'",
    ).run(insertedUser.lastInsertRowid, sessionId);
    return {
      ok: false,
      error: `Provider response ignored because the session is ${postRequestStatus ?? "missing"}.`,
    };
  }

  emit(sessionId, { type: "message", role: "user", content: message });

  if (!result.ok) {
    db.prepare(
      "UPDATE sessions SET status = 'failed', ended_at = datetime('now') WHERE id = ?",
    ).run(sessionId);
    emit(sessionId, { type: "error", message: result.error });
    emit(sessionId, { type: "status", status: "failed" });
    return { ok: false, error: result.error };
  }

  db.prepare(
    "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
  ).run(sessionId, result.content);
  emit(sessionId, { type: "text_delta", text: result.content });
  emit(sessionId, {
    type: "message",
    role: "assistant",
    content: result.content,
  });
  emit(sessionId, {
    type: "turn_end",
    duration_ms: result.latencyMs,
  });

  db.prepare(
    "UPDATE sessions SET status = 'idle', pid = NULL WHERE id = ? AND status NOT IN ('completed', 'failed', 'killed')",
  ).run(sessionId);
  emit(sessionId, { type: "status", status: "idle" });

  return { ok: true };
}

function getStoredSessionRuntimeRow(
  db: Database.Database,
  sessionId: string,
): StoredSessionRuntimeRow | null {
  const row = db
    .prepare(
      `SELECT
        session_auth_mode,
        agent_api_key_env_var,
        local_cli_agent_id,
        agent_model,
        agent_reasoning,
        agent_api_protocol,
        agent_api_version,
        agent_base_url,
        agent_max_tokens
       FROM sessions
       WHERE id = ?
       LIMIT 1`,
    )
    .get(sessionId) as StoredSessionRuntimeRow | undefined;
  return row ?? null;
}

function getStoredSessionStatus(
  db: Database.Database,
  sessionId: string,
): string | null {
  const row = db
    .prepare("SELECT status FROM sessions WHERE id = ? LIMIT 1")
    .get(sessionId) as StoredSessionStatusRow | undefined;
  return row?.status ?? null;
}

function getProviderChatHistory(
  db: Database.Database,
  sessionId: string,
): ProviderChatMessage[] {
  return db
    .prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id ASC",
    )
    .all(sessionId)
    .map((row) => {
      const record = row as { role: "user" | "assistant"; content: string };
      return {
        role: record.role,
        content: record.content,
      };
    });
}
